import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mailReadLater } from "@/db/schema";
import type { Email } from "@/types/mail";

import { compositeId } from "./aggregate";
import { type ListingScope, readListedEmail } from "./listed";
import { type MailScope, mailboxIds, scopeMessage } from "./session";

type ReadLaterScope = Pick<MailScope, "userId" | "mailboxes" | "isAggregate">;

export async function listReadLaterEmails(mail: ReadLaterScope & ListingScope): Promise<Email[]> {
  const ids = await listReadLater(mail);
  const listed = await Promise.all(ids.map((id) => readListedEmail(mail, id)));
  return listed.map(({ email }) => email);
}

export async function listReadLater(mail: ReadLaterScope): Promise<string[]> {
  const rows = await db
    .select({
      messageId: mailReadLater.messageId,
      mailboxId: mailReadLater.mailboxId,
    })
    .from(mailReadLater)
    .where(
      and(
        eq(mailReadLater.userId, mail.userId),
        inArray(mailReadLater.mailboxId, mailboxIds(mail)),
      ),
    )
    .orderBy(desc(mailReadLater.createdAt));

  return rows.map((r) => (mail.isAggregate ? compositeId(r.mailboxId, r.messageId) : r.messageId));
}

export async function addReadLater(mail: ReadLaterScope, messageId: string): Promise<void> {
  const target = scopeMessage(mail, messageId);
  try {
    await db.insert(mailReadLater).values({
      id: crypto.randomUUID(),
      userId: mail.userId,
      mailboxId: target.mailboxId,
      messageId: target.messageId,
      createdAt: new Date(),
    });
  } catch {}
}

export async function removeReadLater(mail: ReadLaterScope, messageId: string): Promise<void> {
  const target = scopeMessage(mail, messageId);
  await db
    .delete(mailReadLater)
    .where(
      and(
        eq(mailReadLater.userId, mail.userId),
        eq(mailReadLater.mailboxId, target.mailboxId),
        eq(mailReadLater.messageId, target.messageId),
      ),
    );
}
