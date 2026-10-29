import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { WorkspaceUserSession } from "@/auth/session";
import { mailSessionFor } from "@/mail/session";
import { enforceRateLimit } from "@/services/rate-limit";

import type { MailboxScope } from "../schema";
import { workspaceSession } from "./workspace-session";

const MAIL_RATE = { scope: "mail-session", limit: 1200, windowSec: 60 };

const resolveMailbox = os
  .$context<{ appUser: WorkspaceUserSession }>()
  .middleware(async ({ context, next }, input: { mailboxSlug: string }) => {
    await enforceRateLimit(context.appUser.userId, MAIL_RATE);
    const mail = await mailSessionFor(context.appUser, input.mailboxSlug);
    if (!mail) {
      throw new ORPCError("NOT_FOUND", { message: "Unknown mailbox" });
    }
    return next({ context: { mail } });
  });

export function mailSession<T extends ZodType<MailboxScope>>(schema: T) {
  return workspaceSession(schema).use(resolveMailbox, (input: MailboxScope) => ({
    mailboxSlug: input.mailboxSlug,
  }));
}
