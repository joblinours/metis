import "server-only";
import { ORPCError } from "@orpc/server";

import {
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  listFolderEmails,
  listMailboxFolders,
  moveFolder,
  moveToFolder,
  renameFolder,
  renameTag,
  setMessageTags,
} from "@/mail/provider-folders";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  createProviderFolderInputSchema,
  createProviderTagInputSchema,
  deleteProviderFolderInputSchema,
  deleteProviderTagInputSchema,
  listFolderEmailsInputSchema,
  listMailFoldersOutputSchema,
  listMessagesOutputSchema,
  mailboxScopeSchema,
  moveToFolderInputSchema,
  moveProviderFolderInputSchema,
  moveToFolderOutputSchema,
  providerFolderSchema,
  providerTagSchema,
  renameProviderFolderInputSchema,
  renameProviderTagInputSchema,
  setProviderTagsInputSchema,
  successSchema,
} from "@/server/schema";

async function atProvider<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw new ORPCError("BAD_GATEWAY", { cause: err });
  }
}

export const foldersRouter = {
  list: mailSession(mailboxScopeSchema)
    .output(listMailFoldersOutputSchema)
    .handler(async ({ context }) => ({ mailboxes: await listMailboxFolders(context.mail) })),

  listEmails: mailSession(listFolderEmailsInputSchema)
    .output(listMessagesOutputSchema)
    .handler(async ({ input, context }) =>
      atProvider(() => listFolderEmails(context.mail, input.folderRef, input.pageToken)),
    ),

  move: mailSession(moveToFolderInputSchema)
    .output(moveToFolderOutputSchema)
    .handler(async ({ input, context }) => ({
      success: true as const,
      id: await atProvider(() => moveToFolder(context.mail, input.id, input.folderRef)),
    })),

  setTags: mailSession(setProviderTagsInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      await atProvider(() => setMessageTags(context.mail, input.ids, input.add, input.remove));
      return { success: true as const };
    }),

  create: mailSession(createProviderFolderInputSchema)
    .output(providerFolderSchema)
    .handler(async ({ input, context }) =>
      atProvider(() =>
        createFolder(context.mail, {
          name: input.name,
          parentRef: input.parentRef,
          mailboxId: input.mailboxId,
        }),
      ),
    ),

  createTag: mailSession(createProviderTagInputSchema)
    .output(providerTagSchema)
    .handler(async ({ input, context }) =>
      atProvider(() => createTag(context.mail, { name: input.name, mailboxId: input.mailboxId })),
    ),

  rename: mailSession(renameProviderFolderInputSchema)
    .output(providerFolderSchema)
    .handler(async ({ input, context }) =>
      atProvider(() => renameFolder(context.mail, input.folderRef, input.name)),
    ),

  moveFolder: mailSession(moveProviderFolderInputSchema)
    .output(providerFolderSchema)
    .handler(async ({ input, context }) =>
      atProvider(() => moveFolder(context.mail, input.folderRef, input.parentRef)),
    ),

  delete: mailSession(deleteProviderFolderInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      await atProvider(() => deleteFolder(context.mail, input.folderRef));
      return { success: true as const };
    }),

  renameTag: mailSession(renameProviderTagInputSchema)
    .output(providerTagSchema)
    .handler(async ({ input, context }) =>
      atProvider(() => renameTag(context.mail, input.tagRef, input.name)),
    ),

  deleteTag: mailSession(deleteProviderTagInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      await atProvider(() => deleteTag(context.mail, input.tagRef));
      return { success: true as const };
    }),
};
