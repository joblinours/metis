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
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
