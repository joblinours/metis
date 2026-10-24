import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mailMute } from "@/db/schema";

import { compositeId } from "./aggregate";
import { type MailScope, mailboxIds, scopeMessage } from "./session";

type MuteScope = Pick<MailScope, "userId" | "mailboxes" | "isAggregate">;

export async function listMutedThreads(mail: MuteScope): Promise<string[]> {
  const rows = await db
    .select({ threadId: mailMute.threadId, mailboxId: mailMute.mailboxId })
    .from(mailMute)
    .where(and(eq(mailMute.userId, mail.userId), inArray(mailMute.mailboxId, mailboxIds(mail))));

  return rows.map((r) => (mail.isAggregate ? compositeId(r.mailboxId, r.threadId) : r.threadId));
}

export async function muteThreads(mail: MuteScope, threadIds: string[]): Promise<string[]> {
  const ids = threadIds.filter(Boolean);
  const now = new Date();
  await Promise.all(
    ids.map(async (tid) => {
      const target = scopeMessage(mail, tid);
      try {
        await db.insert(mailMute).values({
          id: crypto.randomUUID(),
          userId: mail.userId,
          mailboxId: target.mailboxId,
          threadId: target.messageId,
          createdAt: now,
        });
      } catch {}
    }),
  );
  return ids;
}

export async function unmuteThreads(mail: MuteScope, threadIds: string[]): Promise<string[]> {
  const ids = threadIds.filter(Boolean);
  await Promise.all(
    ids.map((tid) => {
      const target = scopeMessage(mail, tid);
      return db
        .delete(mailMute)
        .where(
          and(
            eq(mailMute.userId, mail.userId),
            eq(mailMute.mailboxId, target.mailboxId),
            eq(mailMute.threadId, target.messageId),
          ),
        );
    }),
  );
  return ids;
}
