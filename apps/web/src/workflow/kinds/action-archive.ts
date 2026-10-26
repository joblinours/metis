import {
  NEEDS_MAIL,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionArchive: NodeKindDefinition<"action.archive"> = {
  kind: "action.archive",
  label: "Archive",
  category: "action",
  description: "Moves each message to Archive.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
