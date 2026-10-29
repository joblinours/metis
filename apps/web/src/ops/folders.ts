import "server-only";
import { z } from "zod";

import { BadRequestError } from "@/lib/errors/bad-request";
import {
  createFolder,
  createTag,
  listFolderEmails,
  listMailboxFolders,
  moveToFolder as moveMessageToFolder,
  setMessageTags,
} from "@/mail/provider-folders";

import { emailSummary, emailSummaryOutput } from "./mail";
import { orFailure, type Output } from "./output";
import type { AgentMailbox } from "./scope";

const folderOutput = z.object({
  folderId: z.string(),
  name: z.string(),
  path: z.string(),
  parentFolderId: z.string().optional(),
  kind: z.enum(["folder", "label"]),
  unread: z.number().optional(),
});

const labelOutput = z.object({
  labelId: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

export const listMailFoldersOutput = orFailure(
  z.object({
    mailboxId: z.string(),
    mailbox: z.string(),
    supportsFolders: z.boolean(),
    supportsLabels: z.boolean(),
    labelsNeedReconnect: z.boolean(),
    folders: z.array(folderOutput),
    labels: z.array(labelOutput),
  }),
);

export const listEmailsInFolderOutput = orFailure(
  z.object({
    mailbox: z.string(),
    folderId: z.string(),
    count: z.number(),
    nextPageToken: z.string().optional(),
    emails: z.array(emailSummaryOutput.extend({ labels: z.array(z.string()) })),
  }),
);

export const moveToFolderOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    id: z.string(),
    folderId: z.string(),
  }),
);

export const applyProviderLabelsOutput = orFailure(
  z.object({
    success: z.literal(true),
    mailboxId: z.string(),
    count: z.number(),
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
);

export const createMailFolderOutput = orFailure(
  z.union([
    z.object({ created: z.literal("folder"), mailboxId: z.string(), folder: folderOutput }),
    z.object({ created: z.literal("label"), mailboxId: z.string(), label: labelOutput }),
  ]),
);

async function refusing<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof BadRequestError) return { error: err.message };
    throw err;
  }
}

export async function listMailFolders(
  mailbox: AgentMailbox,
): Promise<Output<typeof listMailFoldersOutput>> {
  const [group] = await listMailboxFolders(mailbox);
  if (!group) return { error: "This mailbox is not reachable" };
  if (group.error) return { error: group.error };
  return {
    mailboxId: mailbox.mailboxId,
    mailbox: mailbox.email,
    supportsFolders: group.supportsFolders,
    supportsLabels: group.supportsTags,
    labelsNeedReconnect: group.tagsNeedReconnect,
    folders: group.folders.map((f) => ({
      folderId: f.ref,
      name: f.name,
      path: f.path,
      ...(f.parentRef ? { parentFolderId: f.parentRef } : {}),
      kind: f.kind,
      ...(f.unread === undefined ? {} : { unread: f.unread }),
    })),
    labels: group.tags.map((t) => ({
      labelId: t.ref,
      name: t.name,
      ...(t.color ? { color: t.color } : {}),
    })),
  };
}

export async function listEmailsInFolder(
  mailbox: AgentMailbox,
  args: { folderId: string; limit: number; pageToken?: string },
): Promise<Output<typeof listEmailsInFolderOutput>> {
  return refusing(async () => {
    const page = await listFolderEmails(mailbox, args.folderId, args.pageToken, args.limit);
    return {
      mailbox: mailbox.email,
      folderId: args.folderId,
      count: page.emails.length,
      nextPageToken: page.nextPageToken,
      emails: page.emails.map((e) => ({ ...emailSummary(e), labels: e.labels ?? [] })),
    };
  });
}

export async function moveToFolder(
  mailbox: AgentMailbox,
  id: string,
  folderId: string,
): Promise<Output<typeof moveToFolderOutput>> {
  return refusing(async () => ({
    success: true as const,
    mailboxId: mailbox.mailboxId,
    id: await moveMessageToFolder(mailbox, id, folderId),
    folderId,
  }));
}

export async function applyProviderLabels(
  mailbox: AgentMailbox,
  args: { ids: string[]; add: string[]; remove: string[] },
): Promise<Output<typeof applyProviderLabelsOutput>> {
  if (args.add.length === 0 && args.remove.length === 0) {
    return { error: "Give at least one labelId to add or remove (from listMailFolders)" };
  }
  return refusing(async () => {
    await setMessageTags(mailbox, args.ids, args.add, args.remove);
    return {
      success: true as const,
      mailboxId: mailbox.mailboxId,
      count: args.ids.length,
      added: args.add,
      removed: args.remove,
    };
  });
}

export async function createMailFolder(
  mailbox: AgentMailbox,
  args: { kind: "folder" | "label"; name: string; parentFolderId?: string },
): Promise<Output<typeof createMailFolderOutput>> {
  return refusing(async () => {
    if (args.kind === "label") {
      const tag = await createTag(mailbox, { name: args.name, mailboxId: mailbox.mailboxId });
      return {
        created: "label" as const,
        mailboxId: mailbox.mailboxId,
        label: { labelId: tag.ref, name: tag.name, ...(tag.color ? { color: tag.color } : {}) },
      };
    }
    const folder = await createFolder(mailbox, {
      name: args.name,
      parentRef: args.parentFolderId,
      mailboxId: mailbox.mailboxId,
    });
    return {
      created: "folder" as const,
      mailboxId: mailbox.mailboxId,
      folder: {
        folderId: folder.ref,
        name: folder.name,
        path: folder.path,
        ...(folder.parentRef ? { parentFolderId: folder.parentRef } : {}),
        kind: folder.kind,
      },
    };
  });
}
