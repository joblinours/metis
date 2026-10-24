import {
  NEEDS_TRIGGER,
  type NodeKindDefinition,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const mailboxSource: NodeKindDefinition<"mailbox.source"> = {
  kind: "mailbox.source",
  label: "Mailbox",
  scope: "any",
  retry: "safe",
  input: NEEDS_TRIGGER,
  output: (node) => (node.operation === "draft" ? "draft" : "message"),
  outputs: () => SINGLE_OUTPUT,
  outputError: SINGLE_OUTPUT_ERROR,
  mailboxId: (node) => node.mailboxId,
  check(node, ctx) {
    const errors: string[] = [];
    const allowed = ctx.allowedMailboxIds;
    if (allowed && !allowed.includes(node.mailboxId)) {
      errors.push("That mailbox is not available in this workspace");
    }
    const triggers = ctx.reachedBy(node.id);
    if (node.operation === "incoming" && [...triggers].some((kind) => kind !== "trigger.newMail")) {
      errors.push(
        "A mailbox set to newly arrived mail only runs under a new-mail trigger. Pick a folder or search instead.",
      );
    }
    return errors;
  },
};
