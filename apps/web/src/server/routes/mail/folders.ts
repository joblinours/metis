import "server-only";
import { ORPCError } from "@orpc/server";

import {
  createFolder,
  createTag,
  listFolderEmails,
  listMailboxFolders,
  moveToFolder,
  setMessageTags,
} from "@/mail/provider-folders";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  createProviderFolderInputSchema,
  createProviderTagInputSchema,
  listFolderEmailsInputSchema,
  listMailFoldersOutputSchema,
  listMessagesOutputSchema,
  mailboxScopeSchema,
  moveToFolderInputSchema,
  moveToFolderOutputSchema,
  providerFolderSchema,
  providerTagSchema,
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
};
