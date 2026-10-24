import { type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const triggerOnce: NodeKindDefinition<"trigger.once"> = {
  kind: "trigger.once",
  label: "At a set time",
  scope: "builtin",
  retry: "safe",
  input: null,
  output: () => "signal",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
