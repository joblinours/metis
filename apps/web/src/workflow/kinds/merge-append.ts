import { NEEDS_MAIL, type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const mergeAppend: NodeKindDefinition<"merge.append"> = {
  kind: "merge.append",
  label: "Combine",
  category: "logic",
  description:
    "Combines the mail of several branches and acts on each message once, even when it arrives by two paths.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: () => "message",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  card(node, ctx) {
    const inputs = ctx.graph.edges.filter((edge) => edge.target === node.id).length;
    if (inputs === 0) return [{ text: "Connect the branches to combine", tone: "warn" }];
    return [`Combines ${inputs} input${inputs === 1 ? "" : "s"}`];
  },
};
