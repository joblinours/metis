import {
  NEEDS_TRIGGER,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionSystem: NodeKindDefinition<"action.system"> = {
  kind: "action.system",
  label: "Maintenance",
  scope: "system",
  retry: "safe",
  input: NEEDS_TRIGGER,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
