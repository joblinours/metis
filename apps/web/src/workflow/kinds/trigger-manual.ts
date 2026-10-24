import { type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const triggerManual: NodeKindDefinition<"trigger.manual"> = {
  kind: "trigger.manual",
  label: "When run manually",
  scope: "any",
  retry: "safe",
  input: null,
  output: () => "signal",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
