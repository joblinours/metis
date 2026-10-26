import {
  NEEDS_MAIL,
  type NodeKindDefinition,
  passThrough,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const actionMute: NodeKindDefinition<"action.mute"> = {
  kind: "action.mute",
  label: "Mute thread",
  category: "action",
  description: "Mutes each message's thread, so replies skip the inbox.",
  scope: "any",
  retry: "safe",
  input: NEEDS_MAIL,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
};
