import { z } from "zod";

import {
  DECISION_BODY_MAX,
  DECISION_OTHER_OPTION_ID,
  type DecisionQuestion,
  decisionQuestionSchema,
  type GraphNode,
  type GraphShape,
} from "./schema";

export const OTHER_OPTION_TEXT = "None of the listed options fits";

export type DecisionAnswer =
  | { type: "boolean"; probability: number }
  | { type: "choice"; probabilities: Record<string, number> }
  | { type: "score"; score: number; probabilities: Record<string, number> }
  | { type: "refusal" };

export interface DecisionThresholds {
  yesAt: number;
  noAt: number;
  minProbability: number;
}

export interface DecisionRoute {
  handle: string;
  probability: number;
  score?: number;
}

export const questionsSchema = z.array(decisionQuestionSchema).max(20);

export function parseQuestions(value: unknown): DecisionQuestion[] {
  const parsed = questionsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function nodeQuestions(node: Pick<GraphNode, "params">): DecisionQuestion[] {
  const bound = node.params.questions;
  return bound?.kind === "literal" ? parseQuestions(bound.value) : [];
}

export function questionHandle(questionId: string): string {
  return `q:${questionId}`;
}

export function questionIdOf(handle: string): string | null {
  return handle.startsWith("q:") ? handle.slice(2) : null;
}

export function branchHandles(question: DecisionQuestion): string[] {
  switch (question.type) {
    case "boolean":
      return ["yes", "no", "unsure"];
    case "choice":
      return [
        ...question.options.map((o) => `opt:${o.id}`),
        ...(question.other ? (["other"] as const) : []),
        "unsure",
      ];
    case "score":
      return [...question.levels.map((l) => `lvl:${l.id}`), "unsure"];
  }
}

export function answerLabel(question: DecisionQuestion | null, handle: string): string {
  if (handle === "yes") return "Yes";
  if (handle === "no") return "No";
  if (handle === "unsure") return "Unsure";
  if (handle === "other") return "Other";
  if (question?.type === "choice" && handle.startsWith("opt:")) {
    const id = handle.slice(4);
    return question.options.find((o) => o.id === id)?.name ?? id;
  }
  if (question?.type === "score" && handle.startsWith("lvl:")) {
    const id = handle.slice(4);
    return question.levels.find((l) => l.id === id)?.name ?? id;
  }
  return handle;
}

export function branchQuestion(
  graph: GraphShape,
  branchId: string,
): { ask: GraphNode; question: DecisionQuestion } | null {
  const edge = graph.edges.find((e) => e.target === branchId);
  if (!edge) return null;
  const ask = graph.nodes.find((n) => n.id === edge.source);
  if (ask?.step !== "ai.ask") return null;
  const questionId = questionIdOf(edge.sourceHandle);
  const question = nodeQuestions(ask).find((q) => q.id === questionId);
  return question ? { ask, question } : null;
}

const STATE_TEXT_LIMIT = 2000;

export type StateValue =
  | string
  | number
  | boolean
  | null
  | StateValue[]
  | { [key: string]: StateValue };

function stateValue(value: unknown, depth = 0): StateValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, STATE_TEXT_LIMIT);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth > 4) return null;
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => stateValue(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, stateValue(entry, depth + 1)]),
    );
  }
  return null;
}

export function decisionState(
  subject: unknown,
  include: readonly string[],
): { [key: string]: StateValue } {
  const source: Record<string, unknown> =
    subject && typeof subject === "object" && !Array.isArray(subject)
      ? Object.fromEntries(Object.entries(subject))
      : { value: subject };
  const picked = Object.entries(source).filter(
    ([key]) => include.length === 0 || include.includes(key),
  );
  return Object.fromEntries(
    picked.map(([key, value]) => [
      key,
      key === "body" && typeof value === "string"
        ? value.slice(0, DECISION_BODY_MAX)
        : stateValue(value),
    ]),
  );
}

function criterion(item: { name: string; description?: string }): string {
  return item.description ? `${item.name}: ${item.description}` : item.name;
}

export function wireQuestion(question: DecisionQuestion) {
  switch (question.type) {
    case "boolean":
      return { type: "boolean" as const, instructions: question.instructions };
    case "choice":
      return {
        type: "choice" as const,
        instructions: question.instructions,
        criteria: {
          ...Object.fromEntries(question.options.map((o) => [o.id, criterion(o)])),
          ...(question.other ? { [DECISION_OTHER_OPTION_ID]: OTHER_OPTION_TEXT } : {}),
        },
      };
    case "score":
      return {
        type: "score" as const,
        instructions: question.instructions,
        criteria: question.levels.map(criterion),
      };
  }
}

const probabilitiesSchema = z.record(z.string(), z.number()).optional();

const rawAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("boolean"), probability: z.number() }),
  z.object({ type: z.literal("choice"), probabilities: probabilitiesSchema }),
  z.object({
    type: z.literal("score"),
    score: z.number(),
    probabilities: probabilitiesSchema,
  }),
]);

export function toDecisionAnswer(answer: unknown): DecisionAnswer {
  const parsed = rawAnswerSchema.safeParse(answer);
  const raw = parsed.success ? parsed.data : undefined;
  switch (raw?.type) {
    case "boolean":
      return { type: "boolean", probability: raw.probability };
    case "choice":
      return { type: "choice", probabilities: raw.probabilities ?? {} };
    case "score":
      return {
        type: "score",
        score: raw.score,
        probabilities: raw.probabilities ?? {},
      };
    default:
      return { type: "refusal" };
  }
}

function top(probabilities: Record<string, number>): { id: string; probability: number } | null {
  let best: { id: string; probability: number } | null = null;
  for (const [id, probability] of Object.entries(probabilities)) {
    if (!best || probability > best.probability) best = { id, probability };
  }
  return best;
}

export function routeAnswer(
  question: DecisionQuestion,
  answer: DecisionAnswer,
  thresholds: DecisionThresholds,
): DecisionRoute {
  if (question.type === "boolean" && answer.type === "boolean") {
    const p = answer.probability;
    if (p >= thresholds.yesAt) return { handle: "yes", probability: p };
    if (p <= thresholds.noAt) return { handle: "no", probability: 1 - p };
    return { handle: "unsure", probability: p };
  }
  if (question.type === "choice" && answer.type === "choice") {
    const best = top(answer.probabilities);
    if (!best || best.probability < thresholds.minProbability) {
      return { handle: "unsure", probability: best?.probability ?? 0 };
    }
    if (best.id === DECISION_OTHER_OPTION_ID) {
      return { handle: "other", probability: best.probability };
    }
    return { handle: `opt:${best.id}`, probability: best.probability };
  }
  if (question.type === "score" && answer.type === "score") {
    const best = top(answer.probabilities);
    const level = best ? question.levels[Number(best.id)] : undefined;
    if (!best || !level || best.probability < thresholds.minProbability) {
      return {
        handle: "unsure",
        probability: best?.probability ?? 0,
        score: answer.score,
      };
    }
    return {
      handle: `lvl:${level.id}`,
      probability: best.probability,
      score: answer.score,
    };
  }
  return { handle: "unsure", probability: 0 };
}
