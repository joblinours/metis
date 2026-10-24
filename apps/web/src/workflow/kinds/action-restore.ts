import {
  NEEDS_MAIL,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionRestore: NodeKindDefinition<"action.restore"> = {
  kind: "action.restore",
  label: "Move back to Inbox",
  scope: "builtin",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
