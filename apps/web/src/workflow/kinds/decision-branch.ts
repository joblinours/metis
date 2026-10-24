import { answerLabel, branchHandles, branchQuestion } from "../decision";
import { decisionRules } from "./decision-ask";
import { NEEDS_MAIL, type NodeKindDefinition, passThrough } from "./types";

export const decisionBranch: NodeKindDefinition<"decision.branch"> = {
  kind: "decision.branch",
  label: "Branch",
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
};
