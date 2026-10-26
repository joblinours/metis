import { type NodeKindDefinition, SINGLE_OUTPUT, SINGLE_OUTPUT_ERROR } from "./types";

export const triggerBeforeSend: NodeKindDefinition<"trigger.beforeSend"> = {
  kind: "trigger.beforeSend",
  label: "Before a message is sent",
  category: "trigger",
  description: "Checks each outgoing message just before it is sent, and can add Bcc recipients.",
  scope: "any",
  retry: "safe",
  input: null,
  output: () => "draft",
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  mailboxId: (node) => node.mailboxId ?? null,
  check(node, ctx) {
    const allowed = ctx.allowedMailboxIds;
    if (node.mailboxId && allowed && !allowed.includes(node.mailboxId)) {
      return ["That mailbox is not available in this workspace"];
    }
    return [];
  },
  card: (node, ctx) => [
    node.mailboxId
      ? { text: `Sent from ${ctx.mailboxEmail(node.mailboxId) ?? "a hidden mailbox"}`, mono: true }
      : "Sent from any mailbox",
  ],
};
