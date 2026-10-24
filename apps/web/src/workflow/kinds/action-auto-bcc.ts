import {
  NEEDS_DRAFT,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionAutoBcc: NodeKindDefinition<"action.autoBcc"> = {
  kind: "action.autoBcc",
  label: "Auto-BCC",
  scope: "any",
  retry: "safe",
  input: NEEDS_DRAFT,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
