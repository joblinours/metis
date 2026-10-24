import { CLASSIFY_BATCH_SIZE, INBOX_PAGE_SIZE } from "@metis/e2e/lib/llm-scenarios";
import { inArray } from "drizzle-orm";

import { db } from "../../../../src/db";
import { mailLabel } from "../../../../src/db/schema";
import { classifyMessages } from "../../../../src/mail/classify";
import { mailboxIds, scopeMessage } from "../../../../src/mail/session";
import { buildThreadSummary } from "../../../../src/mail/thread-summary";
import { decisionEnabled } from "../../../../src/services/decision";
import { eachLimited, Failures, type InboxEmail, loadWorld, type StepContext } from "./context";

const SUMMARY_LANES = 4;

async function classifyLikeTheList(ctx: StepContext, inbox: InboxEmail[]): Promise<number> {
  const { mail } = ctx.session;
  const labelled = new Set(
    (
      await db
        .select({
          mailboxId: mailLabel.mailboxId,
          messageId: mailLabel.messageId,
        })
        .from(mailLabel)
        .where(inArray(mailLabel.mailboxId, mailboxIds(mail)))
    ).map((row) => `${row.mailboxId}/${row.messageId}`),
  );
  const known = new Set(
    inbox
      .filter((e) => {
        const target = scopeMessage(mail, e.id);
        return labelled.has(`${target.mailboxId}/${target.messageId}`);
      })
      .map((e) => e.id),
  );
  const attempted = new Set<string>();
  let classified = 0;
  for (;;) {
    const batch = inbox
      .filter((e) => !known.has(e.id) && !attempted.has(e.id))
      .slice(0, CLASSIFY_BATCH_SIZE);
    if (batch.length === 0) return classified;
    for (const e of batch) attempted.add(e.id);
    const labels = await classifyMessages(
      mail,
      batch.map((e) => ({
        id: e.id,
        sender: e.fromName || e.from,
        subject: e.subject,
        snippet: e.snippet,
      })),
    );
    for (const id of Object.keys(labels)) known.add(id);
    classified += Object.keys(labels).length;
  }
}

async function beyondFirstPage(ctx: StepContext, firstPage: InboxEmail[]): Promise<InboxEmail[]> {
  const { mail } = ctx.session;
  const seen = new Set(firstPage.map((e) => e.id));
  const rest: InboxEmail[] = [];
  let pageToken: string | undefined;
  do {
    const page = await mail.adapter.listMessages("inbox", pageToken, INBOX_PAGE_SIZE);
    rest.push(...page.emails.filter((e) => !seen.has(e.id)));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return rest;
}

export async function run(ctx: StepContext): Promise<void> {
  const { mail } = ctx.session;
  const { inbox } = await loadWorld(ctx);
  const classifier = decisionEnabled("classifier") ? "decision" : "LLM";

  const classified = await classifyLikeTheList(ctx, inbox);
  console.log(`[record] ${classifier} classifier labelled ${classified}/${inbox.length}`);

  const threads = new Map<string, InboxEmail[]>();
  for (const email of inbox) {
    const thread = email.threadId ?? email.id;
    threads.set(thread, [...(threads.get(thread) ?? []), email]);
  }
  const failures = new Failures();
  await eachLimited([...threads.values()], SUMMARY_LANES, async (emails) => {
    for (const email of emails) {
      await failures.attempt(`summary "${email.subject}"`, async () => {
        await buildThreadSummary(mail, email.id, email.threadId);
        console.log(`[record] summary under ${classifier} labels "${email.subject}"`);
      });
    }
  });
  failures.throwIfAny();

  if (decisionEnabled("classifier")) {
    const rest = await beyondFirstPage(ctx, inbox);
    const deep = await classifyLikeTheList(ctx, rest);
    console.log(`[record] decision classifier labelled ${deep}/${rest.length} beyond page one`);
  }
}
