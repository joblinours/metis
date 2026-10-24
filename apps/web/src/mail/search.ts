import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { mailMute, mailReadLater } from "@/db/schema";
import { isOneOf } from "@/lib/guards";
import { conjuncts, type ParserAst, type TagToken, tagKey, tags, tagText } from "@/search/ast";
import { LOCAL_MAIL_STATES, type LocalMailState } from "@/search/fields";
import { matcherFor, needsKey, type SearchDoc } from "@/search/match";
import { parseSearch } from "@/search/query";
import type { Residual } from "@/search/types";
import type { MailListState } from "@/server/schema";
import type { Email, MailFolder, MessagesResponse } from "@/types/mail";
import { listScheduledMail } from "@/workflow/builtins/scheduled-send";
import { listSnoozedEmails } from "@/workflow/builtins/snooze";

import { compositeId, type ResolvedMailbox } from "./aggregate";
import { type CachedSummary, getCachedSummaries, getCachedThreadHeads } from "./cache";
import { messageLabels } from "./labels";
import { listMutedThreads } from "./mute";
import type { MailSession } from "./session";

export interface MailSearchHit extends Email {
  states?: LocalMailState[];
  scheduleId?: string;
  scheduledFor?: string;
  wakeAt?: string;
  unconfirmed?: boolean;
  ai?: boolean;
}

export interface MailSearchResult {
  emails: MailSearchHit[];
  nextPageToken?: string;
  mailboxErrors?: { mailboxId: string; mailboxEmail: string; error: string }[];
}

function isLocalState(tag: TagToken): LocalMailState | null {
  if (tagKey(tag) !== "is") return null;
  const value = (tagText(tag) ?? "").toLowerCase();
  return isOneOf(LOCAL_MAIL_STATES, value) ? value : null;
}

function millis(value: string | undefined): number {
  const ms = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function bareId(email: Pick<Email, "id" | "mailboxId">): string {
  const prefix = email.mailboxId ? `${email.mailboxId}:` : "";
  return prefix && email.id.startsWith(prefix) ? email.id.slice(prefix.length) : email.id;
}

export function mailSearchDoc(email: MailSearchHit, labels: string[] = []): SearchDoc {
  const states = email.states ?? [];
  return {
    type: "mail",
    text: [email.subject, email.snippet, email.from, email.fromName ?? "", ...email.to],
    from: [email.from, email.fromName ?? ""],
    to: [...email.to, ...(email.toRecipients ?? []).map((r) => r.name ?? "")],
    cc: email.cc ?? [],
    subject: email.subject,
    filename: (email.attachments ?? []).map((a) => a.filename),
    has: (email.attachments?.length ?? 0) > 0 ? ["attachment"] : [],
    is: [email.isRead ? "read" : "unread", ...(email.isStarred ? ["starred"] : []), ...states],
    "mail-folder": [email.folder, ...(email.isStarred ? ["starred"] : [])],
    label: labels,
    mailbox: [email.mailboxSlug ?? "", email.mailboxEmail ?? ""],
    date: millis(email.date),
  };
}

interface Enrichment {
  labels: Map<string, string>;
  readLater: Set<string>;
  muted: Set<string>;
}

async function enrich(
  userId: string,
  emails: MailSearchHit[],
  residual: Residual,
): Promise<Enrichment> {
  const out: Enrichment = {
    labels: new Map(),
    readLater: new Set(),
    muted: new Set(),
  };
  if (!residual || emails.length === 0) return out;
  const byMailbox = new Map<string, MailSearchHit[]>();
  for (const email of emails) {
    if (!email.mailboxId) continue;
    const list = byMailbox.get(email.mailboxId) ?? [];
    list.push(email);
    byMailbox.set(email.mailboxId, list);
  }
  const mailboxIds = [...byMailbox.keys()];

  if (needsKey(residual, "label")) {
    const labelled = await Promise.all(
      [...byMailbox].map(async ([mailboxId, list]) => ({
        mailboxId,
        labels: await messageLabels(
          mailboxId,
          list.map((e) => bareId(e)),
        ),
      })),
    );
    for (const { mailboxId, labels } of labelled) {
      for (const [id, label] of labels) out.labels.set(`${mailboxId}:${id}`, label);
    }
  }

  if (needsKey(residual, "is")) {
    const later = await db
      .select({
        mailboxId: mailReadLater.mailboxId,
        messageId: mailReadLater.messageId,
      })
      .from(mailReadLater)
      .where(and(eq(mailReadLater.userId, userId), inArray(mailReadLater.mailboxId, mailboxIds)));
    for (const row of later) out.readLater.add(`${row.mailboxId}:${row.messageId}`);
    const muted = await db
      .select({ mailboxId: mailMute.mailboxId, threadId: mailMute.threadId })
      .from(mailMute)
      .where(and(eq(mailMute.userId, userId), inArray(mailMute.mailboxId, mailboxIds)));
    for (const row of muted) out.muted.add(`${row.mailboxId}:${row.threadId}`);
  }
  return out;
}

function withStates(email: MailSearchHit, extra: Enrichment): MailSearchHit {
  const key = `${email.mailboxId}:${bareId(email)}`;
  const thread = email.threadId?.startsWith(`${email.mailboxId}:`)
    ? email.threadId
    : `${email.mailboxId}:${email.threadId ?? ""}`;
  const states = new Set(email.states ?? []);
  if (extra.readLater.has(key)) states.add("readlater");
  if (email.threadId && extra.muted.has(thread)) states.add("muted");
  return { ...email, states: [...states] };
}

function accepter(userId: string, timeZone: string) {
  return async (residual: Residual, emails: Email[]): Promise<Email[]> => {
    if (!residual) return emails;
    const extra = await enrich(userId, emails, residual);
    const matcher = matcherFor(residual, timeZone);
    return emails.filter((email) => {
      const hit = withStates(email, extra);
      const label = extra.labels.get(`${email.mailboxId}:${bareId(email)}`);
      return matcher.matches(mailSearchDoc(hit, label ? [label] : []));
    });
  };
}

function fromCache(
  mailbox: ResolvedMailbox,
  row: CachedSummary,
  state: LocalMailState,
): MailSearchHit {
  return {
    id: compositeId(mailbox.mailboxId, row.providerMessageId),
    threadId: row.threadId ? compositeId(mailbox.mailboxId, row.threadId) : undefined,
    from: row.senderEmail ?? "",
    fromName: row.sender,
    to: [],
    subject: row.subject || "(no subject)",
    snippet: row.snippet ?? "",
    date: row.receivedAt.toISOString(),
    isRead: row.isRead,
    isStarred: false,
    provider: mailbox.provider,
    folder: "inbox",
    mailboxId: mailbox.mailboxId,
    mailboxSlug: mailbox.mailboxSlug,
    mailboxEmail: mailbox.mailboxEmail,
    states: [state],
  };
}

function splitComposite(id: string): { mailboxId: string; rest: string } {
  const at = id.indexOf(":");
  return at === -1
    ? { mailboxId: "", rest: id }
    : { mailboxId: id.slice(0, at), rest: id.slice(at + 1) };
}

async function localStateMail(
  mail: MailSession,
  wanted: Set<LocalMailState>,
): Promise<MailSearchHit[]> {
  const out: MailSearchHit[] = [];
  const boxes = new Map(mail.mailboxes.map((m) => [m.mailboxId, m]));

  if (wanted.has("scheduled")) {
    const scheduled = await Promise.all(
      mail.mailboxes.map((mailbox) => listScheduledMail([mailbox.mailboxId], mail.userId)),
    );
    for (const [i, mailbox] of mail.mailboxes.entries()) {
      for (const item of scheduled[i] ?? []) {
        if (item.sent || item.status === "cancelled") continue;
        out.push({
          id: `scheduled:${item.id}`,
          from: mailbox.mailboxEmail,
          to: item.payload?.to ?? [],
          cc: item.payload?.cc,
          subject: item.subject || "(no subject)",
          snippet: item.error ?? "",
          date: item.scheduledFor.toISOString(),
          isRead: true,
          isStarred: false,
          provider: mailbox.provider,
          folder: "drafts",
          mailboxId: mailbox.mailboxId,
          mailboxSlug: mailbox.mailboxSlug,
          mailboxEmail: mailbox.mailboxEmail,
          states: ["scheduled"],
          scheduleId: item.id,
          scheduledFor: item.scheduledFor.toISOString(),
          unconfirmed: item.unconfirmed,
        });
      }
    }
  }

  if (wanted.has("snoozed")) {
    const snoozed = await listSnoozedEmails(mail);
    for (const email of snoozed) {
      const { mailboxId } = splitComposite(email.id);
      const mailbox = boxes.get(mailboxId);
      if (!mailbox) continue;
      out.push({
        ...email,
        mailboxId,
        mailboxSlug: mailbox.mailboxSlug,
        mailboxEmail: mailbox.mailboxEmail,
        states: ["snoozed"],
        scheduleId: email.scheduleId,
        wakeAt: email.wakeAt,
      });
    }
  }

  if (wanted.has("readlater")) {
    const ids = await db
      .select({
        mailboxId: mailReadLater.mailboxId,
        messageId: mailReadLater.messageId,
      })
      .from(mailReadLater)
      .where(
        and(
          eq(mailReadLater.userId, mail.userId),
          inArray(mailReadLater.mailboxId, [...boxes.keys()]),
        ),
      );
    const rows = await getCachedSummaries(
      ids.map((r) => ({
        mailboxId: r.mailboxId,
        providerMessageId: r.messageId,
      })),
    );
    for (const row of rows) {
      const mailbox = boxes.get(row.mailboxId);
      if (mailbox) out.push(fromCache(mailbox, row, "readlater"));
    }
  }

  if (wanted.has("muted")) {
    const threads = await listMutedThreads({ ...mail, isAggregate: true });
    const heads = await getCachedThreadHeads(
      threads.map((id) => {
        const { mailboxId, rest } = splitComposite(id);
        return { mailboxId, threadId: rest };
      }),
    );
    for (const row of heads) {
      const mailbox = boxes.get(row.mailboxId);
      if (mailbox) out.push(fromCache(mailbox, row, "muted"));
    }
  }

  return out;
}

function wantedStates(ast: ParserAst | boolean): {
  any: Set<LocalMailState>;
  top: boolean;
} {
  const any = new Set<LocalMailState>();
  if (typeof ast === "boolean") return { any, top: false };
  for (const tag of tags(ast)) {
    const state = isLocalState(tag);
    if (state) any.add(state);
  }
  const top = conjuncts(ast).some((node) => node.type === "Tag" && isLocalState(node) !== null);
  return { any, top };
}

export async function listMailInState(
  mail: MailSession,
  folder: MailFolder,
  state: MailListState,
  pageToken?: string,
): Promise<MessagesResponse> {
  const parsed = parseSearch(`mail-folder:${folder} is:${state}`);
  if (!parsed.ok) throw new Error(`[mail] could not build the ${state} filter`);
  return mail.adapter.searchAst({
    query: parsed.ast,
    cursor: pageToken,
    timeZone: "UTC",
    accept: accepter(mail.userId, "UTC"),
  });
}

export async function searchMail(
  mail: MailSession,
  query: ParserAst | boolean,
  opts: { cursor?: string; timeZone: string },
): Promise<MailSearchResult> {
  if (query === false) return { emails: [] };
  const states = wantedStates(query);
  const firstPage = !opts.cursor;
  const policies = new Map(mail.mailboxes.map((m) => [m.mailboxId, m.policy.ai]));
  const withPolicy = (email: MailSearchHit): MailSearchHit => ({
    ...email,
    ai: email.mailboxId ? (policies.get(email.mailboxId) ?? false) : false,
  });

  const local = states.any.size > 0 && firstPage ? await localStateMail(mail, states.any) : [];
  const matcher = matcherFor(typeof query === "boolean" ? null : query, opts.timeZone);
  const localHits = local.filter((email) =>
    typeof query === "boolean" ? query : matcher.matches(mailSearchDoc(email)),
  );

  if (states.top) {
    return {
      emails: localHits.toSorted((a, b) => millis(b.date) - millis(a.date)).map(withPolicy),
    };
  }

  const page = await mail.adapter.searchAst({
    query,
    cursor: opts.cursor,
    timeZone: opts.timeZone,
    accept: accepter(mail.userId, opts.timeZone),
  });
  const seen = new Set(page.emails.map((e) => e.id));
  const merged = [...page.emails, ...localHits.filter((email) => !seen.has(email.id))].toSorted(
    (a, b) => millis(b.date) - millis(a.date),
  );

  return {
    emails: merged.map(withPolicy),
    nextPageToken: page.nextPageToken,
    mailboxErrors: page.mailboxErrors,
  };
}
