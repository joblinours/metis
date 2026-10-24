import { NEEDS_DRAFT, type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const actionSend: NodeKindDefinition<"action.send"> = {
  kind: "action.send",
  label: "Send",
  scope: "builtin",
  retry: "dispatch",
  input: NEEDS_DRAFT,
  output: () => "message",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
