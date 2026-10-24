import "server-only";
import { ORPCError } from "@orpc/server";

import type { ResolvedMailbox } from "@/mail/aggregate";
import { type MailSession, sendingMailbox } from "@/mail/session";

export async function resolveSender(
  mail: MailSession,
  fromMailboxSlug?: string,
): Promise<ResolvedMailbox> {
  try {
    return await sendingMailbox(mail, fromMailboxSlug);
  } catch (err) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Pick which mailbox to send from.",
      cause: err,
    });
  }
}
