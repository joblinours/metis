import "server-only";
import { ORPCError } from "@orpc/server";

import { listMutedThreads, muteThreads, unmuteThreads } from "@/mail/mute";
import { mailSession } from "@/server/middlewares/mail-session";
import {
  listMuteOutputSchema,
  mailboxScopeSchema,
  muteThreadsInputSchema,
  muteThreadsOutputSchema,
  unmuteThreadsOutputSchema,
} from "@/server/schema";

function requireThreads(threadIds: string[]): void {
  if (threadIds.filter(Boolean).length === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Select at least one conversation.",
    });
  }
}

export const muteRouter = {
  list: mailSession(mailboxScopeSchema)
    .output(listMuteOutputSchema)
    .handler(async ({ context }) => ({
      threadIds: await listMutedThreads(context.mail),
    })),

  add: mailSession(muteThreadsInputSchema)
    .output(muteThreadsOutputSchema)
    .handler(async ({ input, context }) => {
      requireThreads(input.threadIds);
      const muted = await muteThreads(context.mail, input.threadIds);
      return { success: true as const, muted };
    }),

  remove: mailSession(muteThreadsInputSchema)
    .output(unmuteThreadsOutputSchema)
    .handler(async ({ input, context }) => {
      requireThreads(input.threadIds);
      await unmuteThreads(context.mail, input.threadIds);
      return { success: true as const };
    }),
};
