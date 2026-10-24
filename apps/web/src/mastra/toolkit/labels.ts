import "server-only";
import { createCustomLabel, deleteCustomLabel, listCustomLabels } from "@/mail/custom-labels";
import {
  clearUserLabel,
  labelTargets,
  mailboxLabelKeys,
  setLabelOnMessages,
  setUserLabel,
} from "@/mail/labels";
import { BUILT_IN_LABELS } from "@/server/schema";
import type { CustomLabelColor } from "@/types/mail";

import type { AgentMailbox } from "../runtime-context";
import type { Resolved } from "./resolve";

export async function listLabels(mailboxIds: string[]) {
  const keys = await mailboxLabelKeys(mailboxIds);
  const builtIn = new Set<string>(BUILT_IN_LABELS);
  return {
    labels: [...keys].map((key) => ({ key, builtIn: builtIn.has(key) })),
  };
}

type LabelResult = {
  success: true;
  mailboxId: string;
  id: string;
  label: string;
};

export async function setLabel(args: {
  userId: string;
  mailbox: AgentMailbox;
  id: string;
  label: string;
}): Promise<Resolved<LabelResult>> {
  const target = args.mailbox.scope(args.id);
  const keys = await mailboxLabelKeys([target.mailboxId]);
  if (!keys.has(args.label)) {
    return {
      error: `Unknown label key "${args.label}". These are all of them: ${[...keys].join(", ")}`,
    };
  }
  await setUserLabel({
    userId: args.userId,
    mailboxId: target.mailboxId,
    messageId: target.messageId,
    label: args.label,
  });
  return {
    success: true,
    mailboxId: target.mailboxId,
    id: args.id,
    label: args.label,
  };
}

export async function setLabels(args: {
  userId: string;
  mailbox: AgentMailbox;
  ids: string[];
  label: string;
}) {
  const keys = await mailboxLabelKeys([args.mailbox.mailboxId]);
  if (!keys.has(args.label)) {
    return {
      error: `Unknown label key "${args.label}". These are all of them: ${[...keys].join(", ")}`,
    };
  }
  const previous = await setLabelOnMessages({
    userId: args.userId,
    targets: labelTargets(args.mailbox, args.ids),
    label: args.label,
  });
  return {
    success: true,
    mailboxId: args.mailbox.mailboxId,
    label: args.label,
    count: args.ids.length,
    previous,
  };
}

export async function createLabel(args: {
  userId: string;
  mailbox: AgentMailbox;
  name: string;
  color?: CustomLabelColor;
}) {
  const created = await createCustomLabel({
    userId: args.userId,
    mailboxIds: [args.mailbox.mailboxId],
    name: args.name,
    color: args.color,
  });
  if ("error" in created) return { error: created.error };
  return {
    created: true,
    mailboxId: args.mailbox.mailboxId,
    key: created.key,
    name: created.name,
    color: created.color,
  };
}

export async function deleteLabel(mailbox: AgentMailbox, key: string) {
  const custom = await listCustomLabels([mailbox.mailboxId]);
  const label = custom.find((l) => l.key === key);
  if (!label) {
    return {
      error: `"${key}" is not a custom label in this mailbox — built-in labels cannot be deleted. Custom labels here: ${
        custom.map((l) => l.key).join(", ") || "none"
      }`,
    };
  }
  const deleted = await deleteCustomLabel({
    mailboxIds: [mailbox.mailboxId],
    id: label.id,
  });
  if ("error" in deleted) return deleted;
  return { deleted: true, mailboxId: mailbox.mailboxId, key };
}

export async function clearLabel(mailbox: AgentMailbox, id: string) {
  const target = mailbox.scope(id);
  await clearUserLabel({
    mailboxId: target.mailboxId,
    messageId: target.messageId,
  });
  return { success: true, mailboxId: target.mailboxId, id };
}
