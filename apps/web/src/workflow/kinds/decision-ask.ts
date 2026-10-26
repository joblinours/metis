import { questionHandle } from "../decision";
import { MAX_DECISION_CHOICES, type WorkflowNode } from "../schema";
import {
  type CardEntry,
  type KindCheckContext,
  NEEDS_MAIL,
  type NodeKindDefinition,
  type NodeOf,
  passThrough,
} from "./types";

export function decisionRules(nodeId: string, ctx: KindCheckContext): string[] {
  const errors: string[] = [];
  if (ctx.allowDecisionNodes === false) {
    errors.push("Ask and Branch steps are turned off on this instance");
  }
  if (ctx.reachedBy(nodeId).has("trigger.beforeSend")) {
    errors.push("Ask and Branch steps cannot run before a message is sent");
  }
  return errors;
}

function duplicated(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function checkQuestions(node: NodeOf<"decision.ask">): string | null {
  if (node.questions.length === 0) return "Add a question to this Ask step";
  if (duplicated(node.questions.map((q) => q.id))) {
    return "Two questions share an id";
  }
  for (const question of node.questions) {
    if (question.type === "choice") {
      if (duplicated(question.options.map((o) => o.id))) {
        return "Two answers of a question share an id";
      }
      const total = question.options.length + (question.other ? 1 : 0);
      if (total > MAX_DECISION_CHOICES) {
        return `A Pick one question can offer at most ${MAX_DECISION_CHOICES} answers, Other included`;
      }
    }
    if (question.type === "score" && duplicated(question.levels.map((l) => l.id))) {
      return "Two levels of a question share an id";
    }
  }
  return null;
}

function feedsAiOff(node: WorkflowNode, ctx: KindCheckContext): boolean {
  if (!ctx.aiMailboxIds) return false;
  const aiOn = new Set(ctx.aiMailboxIds);
  const stack = ctx.incoming(node.id);
  const walked = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || walked.has(id)) continue;
    walked.add(id);
    const upstream = ctx.byId.get(id);
    if (upstream?.kind === "mailbox.source" && !aiOn.has(upstream.mailboxId)) {
      return true;
    }
    stack.push(...ctx.incoming(id));
  }
  return false;
}

export const decisionAsk: NodeKindDefinition<"decision.ask"> = {
  kind: "decision.ask",
  label: "Ask",
  category: "ai",
  description:
    "Asks the decision model your questions about each message. Connect each question to a Branch step.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: (node) =>
    node.questions.map((question, index) => ({
      id: questionHandle(question.id),
      label: `Q${index + 1}`,
    })),
  outputError: "Connect from a question this step still has",
  check(node, ctx) {
    const errors = decisionRules(node.id, ctx);
    const questions = checkQuestions(node);
    if (questions) errors.push(questions);
    if (ctx.outgoing(node.id).some((id) => ctx.byId.get(id)?.kind !== "decision.branch")) {
      errors.push("An Ask step's questions connect only to Branch steps");
    }
    if (feedsAiOff(node, ctx)) {
      errors.push("Turn AI on for every mailbox that feeds this Ask step");
    }
    return errors;
  },
  card(node) {
    if (node.questions.length === 0) return [{ text: "Add a question", tone: "warn" }];
    const lines: CardEntry[] = node.questions.slice(0, 2).map((question, index) => ({
      text: `Q${index + 1}: ${question.instructions || "(no question text yet)"}`,
    }));
    if (node.questions.length > 2) {
      lines.push({ text: `and ${node.questions.length - 2} more`, tone: "muted" });
    }
    return lines;
  },
};
