import { answerLabel, branchHandles, branchQuestion } from "../decision";
import { decisionRules } from "./decision-ask";
import { NEEDS_MAIL, type NodeKindDefinition, passThrough } from "./types";

export const decisionBranch: NodeKindDefinition<"decision.branch"> = {
  kind: "decision.branch",
  label: "Branch",
  category: "ai",
  description: "Routes each message by its answer to one question of an Ask step.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs(node, graph) {
    const asked = branchQuestion(graph, node.id);
    if (!asked) return [];
    return branchHandles(asked.question).map((id) => ({
      id,
      label: answerLabel(asked.question, id),
    }));
  },
  outputError: "Connect from an answer this step still has",
  check(node, ctx) {
    const errors = decisionRules(node.id, ctx);
    if (node.noAt >= node.yesAt) {
      errors.push("Set the No threshold below the Yes threshold");
    }
    const fed = ctx.incoming(node.id).length > 0;
    if (fed && !branchQuestion(ctx.graph, node.id)) {
      errors.push("Connect a Branch step to a question on an Ask step");
    }
    return errors;
  },
  card(node, ctx) {
    const asked = branchQuestion(ctx.graph, node.id);
    if (!asked) return [{ text: "Connect a question of an Ask step", tone: "warn" }];
    const index = asked.ask.questions.findIndex((q) => q.id === asked.question.id);
    return [
      `Q${index + 1}: ${asked.question.instructions || "(no question text yet)"}`,
      {
        text:
          asked.question.type === "boolean"
            ? `Yes at ${percent(node.yesAt)} or more, No at ${percent(node.noAt)} or less`
            : `Top answer at ${percent(node.minProbability)} or more`,
        tone: "muted",
      },
    ];
  },
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
