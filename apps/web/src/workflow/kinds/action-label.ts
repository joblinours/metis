import {
  NEEDS_MAIL,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionLabel: NodeKindDefinition<"action.label"> = {
  kind: "action.label",
  label: "Apply label",
  category: "action",
  description: "Applies a label to each message.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  card: (node, ctx) => [`Label: ${ctx.labelName(node.label)}`],
};
