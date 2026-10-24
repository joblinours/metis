import { z } from "zod";

import {
  DECISION_BODY_MAX,
  DECISION_OTHER_OPTION_ID,
  type DecisionQuestion,
  type DecisionStateField,
  type SourceHandle,
  type WorkflowGraph,
  type WorkflowNode,
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
  handle: SourceHandle;
  probability: number;
  score?: number;
}

export interface DecisionFacts {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  bodyText?: string;
  hasAttachment?: boolean;
  date?: string;
}

export function questionHandle(questionId: string): SourceHandle {
  return `q:${questionId}`;
}

export function questionIdOf(handle: string): string | null {
  return handle.startsWith("q:") ? handle.slice(2) : null;
}

export function branchHandles(question: DecisionQuestion): SourceHandle[] {
  switch (question.type) {
    case "boolean":
      return ["yes", "no", "unsure"];
    case "choice":
      return [
        ...question.options.map((o): SourceHandle => `opt:${o.id}`),
        ...(question.other ? (["other"] as const) : []),
        "unsure",
      ];
    case "score":
      return [...question.levels.map((l): SourceHandle => `lvl:${l.id}`), "unsure"];
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
  graph: Pick<WorkflowGraph, "nodes" | "edges">,
  branchId: string,
): {
  ask: Extract<WorkflowNode, { kind: "decision.ask" }>;
  question: DecisionQuestion;
} | null {
  const edge = graph.edges.find((e) => e.target === branchId);
  if (!edge) return null;
  const ask = graph.nodes.find((n) => n.id === edge.source);
  if (ask?.kind !== "decision.ask") return null;
  const questionId = questionIdOf(edge.sourceHandle);
  const question = ask.questions.find((q) => q.id === questionId);
  return question ? { ask, question } : null;
}

function sender(facts: DecisionFacts): string {
  return facts.fromName ? `${facts.fromName} <${facts.from}>` : facts.from;
}

export function buildDecisionState(
  facts: DecisionFacts,
  fields: readonly DecisionStateField[],
): Record<string, string | string[] | boolean> {
  const state: Record<string, string | string[] | boolean> = {};
  for (const field of fields) {
    switch (field) {
      case "from":
        state.from = sender(facts);
        break;
      case "to":
        state.to = facts.to;
        break;
      case "cc":
        state.cc = facts.cc ?? [];
        break;
      case "subject":
        state.subject = facts.subject;
        break;
      case "snippet":
        state.snippet = facts.snippet;
        break;
      case "body":
        state.body = (facts.bodyText ?? "").slice(0, DECISION_BODY_MAX);
        break;
      case "hasAttachment":
        state.hasAttachment = facts.hasAttachment === true;
        break;
      case "date":
        state.date = facts.date ?? "";
        break;
    }
  }
  return state;
}

export function needsFullFacts(fields: readonly DecisionStateField[]): boolean {
  return fields.includes("body") || fields.includes("hasAttachment");
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
