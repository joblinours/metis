import "server-only";
import {
  addReadLater,
  listReadLater,
  listReadLaterEmails,
  removeReadLater,
} from "@/mail/read-later";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  listReadLaterEmailsOutputSchema,
  listReadLaterOutputSchema,
  mailboxScopeSchema,
  readLaterAddInputSchema,
  readLaterMutationOutputSchema,
  readLaterRemoveInputSchema,
} from "@/server/schema";

export const readLaterRouter = {
  list: mailSession(mailboxScopeSchema)
    .output(listReadLaterOutputSchema)
    .handler(async ({ context }) => ({
      messageIds: await listReadLater(context.mail),
    })),

  listEmails: mailSession(mailboxScopeSchema)
    .output(listReadLaterEmailsOutputSchema)
    .handler(async ({ context }) => ({
      emails: await listReadLaterEmails(context.mail),
    })),

  add: mailSession(readLaterAddInputSchema)
    .output(readLaterMutationOutputSchema)
    .handler(async ({ input, context }) => {
      await addReadLater(context.mail, input.messageId);
      return { success: true as const, messageId: input.messageId };
    }),

  remove: mailSession(readLaterRemoveInputSchema)
    .output(readLaterMutationOutputSchema)
    .handler(async ({ input, context }) => {
      await removeReadLater(context.mail, input.messageId);
      return { success: true as const, messageId: input.messageId };
    }),
};
