import {
  type CardEntry,
  NEEDS_TRIGGER,
  type NodeKindDefinition,
  SINGLE_OUTPUT,
  SINGLE_OUTPUT_ERROR,
} from "./types";

export const mailboxSource: NodeKindDefinition<"mailbox.source"> = {
  kind: "mailbox.source",
  label: "Mailbox",
  category: "mail",
  description: "Reads mail from one mailbox: what just arrived, a folder, or a search.",
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
  card(node, ctx) {
    const email = node.mailboxId ? ctx.mailboxEmail(node.mailboxId) : null;
    const where: CardEntry = email
      ? { text: email, mono: true }
      : { text: node.mailboxId ? "A hidden mailbox" : "Pick a mailbox", tone: "warn" };
    switch (node.operation) {
      case "incoming":
        return [where, "Newly arrived mail"];
      case "list":
        return [
          where,
          node.query
            ? { text: `Search: ${node.query}`, mono: true }
            : `${node.folder[0]?.toUpperCase()}${node.folder.slice(1)}`,
          { text: `Up to ${node.limit} messages`, tone: "muted" },
        ];
      case "message":
        return [where, "One message"];
      case "draft":
        return [where, "The message being sent"];
    }
  },
};
