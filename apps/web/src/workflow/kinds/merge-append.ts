import { NEEDS_MAIL, type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const mergeAppend: NodeKindDefinition<"merge.append"> = {
  kind: "merge.append",
  label: "Combine",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: () => "message",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
