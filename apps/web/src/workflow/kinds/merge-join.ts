import { NEEDS_MAIL, type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const mergeJoin: NodeKindDefinition<"merge.join"> = {
  kind: "merge.join",
  label: "Wait for all",
  category: "logic",
  description:
    "Waits until every branch that ran has finished, then passes all their mail on together.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: () => "message",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  card(node, ctx) {
    const inputs = ctx.graph.edges.filter((edge) => edge.target === node.id).length;
    if (inputs === 0) return [{ text: "Connect the branches to combine", tone: "warn" }];
    return [`Waits for ${inputs} input${inputs === 1 ? "" : "s"}`];
  },
};
