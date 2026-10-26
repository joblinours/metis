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
  category: "action",
  description: "Adds a Bcc recipient to the outgoing message before it leaves.",
  scope: "any",
  retry: "safe",
  input: NEEDS_DRAFT,
  output: passThrough,
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  card: (node) => [
    node.address
      ? { text: `Bcc ${node.address}`, mono: true }
      : { text: "No address yet", tone: "warn" },
  ],
};
