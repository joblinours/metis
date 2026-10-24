import { NEEDS_MAIL, type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const mergeJoin: NodeKindDefinition<"merge.join"> = {
  kind: "merge.join",
  label: "Wait for all",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: () => "message",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
