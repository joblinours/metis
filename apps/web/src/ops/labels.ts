import "server-only";
import { z } from "zod";

import { BadRequestError } from "@/lib/errors/bad-request";
import { clearUserLabel, mailboxLabelKeys, setUserLabel } from "@/mail/labels";
import {
  createTag,
  deleteTag,
  listMailboxFolders,
  messageTags,
  renameTag,
  setMessageTags,
} from "@/mail/provider-folders";

import { orFailure, type Output } from "./output";
import type { AgentMailbox } from "./scope";

const labelOutput = z.object({
  labelId: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

export const listLabelsOutput = z.object({
  mailboxes: z.array(
    z.object({
      mailboxId: z.string(),
      mailbox: z.string(),
      supportsLabels: z.boolean(),
      labelsNeedReconnect: z.boolean(),
      labels: z.array(labelOutput),
      error: z.string().optional(),
    }),
  ),
});

export const setLabelOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    id: z.string(),
    labelId: z.string(),
  }),
);

export const setLabelsOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    labelId: z.string(),
    count: z.number(),
  }),
);

export const clearLabelOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    id: z.string(),
    removed: z.array(z.string()),
  }),
);

export const createLabelOutput = orFailure(
  z.object({ created: z.literal(true), mailboxId: z.string(), label: labelOutput }),
);

export const renameLabelOutput = orFailure(
  z.object({ renamed: z.literal(true), mailboxId: z.string(), label: labelOutput }),
);

export const deleteLabelOutput = orFailure(
  z.object({ deleted: z.literal(true), mailboxId: z.string(), labelId: z.string() }),
);

async function refusing<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof BadRequestError) return { error: err.message };
    throw err;
  }
}

function asLabel(tag: { ref: string; name: string; color?: string }) {
  return { labelId: tag.ref, name: tag.name, ...(tag.color ? { color: tag.color } : {}) };
}

export async function listLabels(
  mailboxes: AgentMailbox[],
): Promise<Output<typeof listLabelsOutput>> {
  const groups = await Promise.all(mailboxes.map((mailbox) => listMailboxFolders(mailbox)));
  return {
    mailboxes: groups.flat().map((group) => ({
      mailboxId: group.mailboxId,
      mailbox: group.mailboxEmail,
      supportsLabels: group.supportsTags,
      labelsNeedReconnect: group.tagsNeedReconnect,
      labels: group.tags.map(asLabel),
      ...(group.error ? { error: group.error } : {}),
    })),
  };
}

export async function setLabel(
  mailbox: AgentMailbox,
  id: string,
  labelId: string,
): Promise<Output<typeof setLabelOutput>> {
  return refusing(async () => {
    await setMessageTags(mailbox, [id], [labelId], []);
    return { success: true as const, mailboxId: mailbox.mailboxId, id, labelId };
  });
}

export async function setLabels(
  mailbox: AgentMailbox,
  ids: string[],
  labelId: string,
): Promise<Output<typeof setLabelsOutput>> {
  return refusing(async () => {
    await setMessageTags(mailbox, ids, [labelId], []);
    return {
      success: true as const,
      mailboxId: mailbox.mailboxId,
      labelId,
      count: ids.length,
    };
  });
}

export async function clearLabel(
  mailbox: AgentMailbox,
  id: string,
  labelId?: string,
): Promise<Output<typeof clearLabelOutput>> {
  return refusing(async () => {
    const removed = labelId ? [labelId] : await messageTags(mailbox, id);
    if (removed.length > 0) await setMessageTags(mailbox, [id], [], removed);
    return { success: true as const, mailboxId: mailbox.mailboxId, id, removed };
  });
}

export async function createLabel(
  mailbox: AgentMailbox,
  name: string,
): Promise<Output<typeof createLabelOutput>> {
  return refusing(async () => ({
    created: true as const,
    mailboxId: mailbox.mailboxId,
    label: asLabel(await createTag(mailbox, { name, mailboxId: mailbox.mailboxId })),
  }));
}

export async function renameLabel(
  mailbox: AgentMailbox,
  labelId: string,
  name: string,
): Promise<Output<typeof renameLabelOutput>> {
  return refusing(async () => ({
    renamed: true as const,
    mailboxId: mailbox.mailboxId,
    label: asLabel(await renameTag(mailbox, labelId, name)),
  }));
}

export async function deleteLabel(
  mailbox: AgentMailbox,
  labelId: string,
): Promise<Output<typeof deleteLabelOutput>> {
  return refusing(async () => {
    await deleteTag(mailbox, labelId);
    return { deleted: true as const, mailboxId: mailbox.mailboxId, labelId };
  });
}

export async function labelMessage(args: {
  userId: string;
  mailboxId: string;
  messageId: string;
  label: string;
  action: "add" | "remove";
  validate?: boolean;
}): Promise<void> {
  if (args.action === "remove") {
    await clearUserLabel({ mailboxId: args.mailboxId, messageId: args.messageId });
    return;
  }
  const keys = args.validate === false ? null : await mailboxLabelKeys([args.mailboxId]);
  if (keys && !keys.has(args.label)) {
    throw new Error(`There is no label "${args.label}" in that mailbox`);
  }
  await setUserLabel({
    userId: args.userId,
    mailboxId: args.mailboxId,
    messageId: args.messageId,
    label: args.label,
  });
}
