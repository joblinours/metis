import { z } from "zod";

import type { ConnectionAuth, MailProvider } from "@/connections/types";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { type TagToken, tagKey, tagText } from "@/search/ast";
import { bindTags } from "@/search/pushdown";
import type { AstSearch } from "@/search/types";
import type { Email, MailboxError, MailFolder, MessagesResponse } from "@/types/mail";
import type { ResolvedPolicy } from "@/workspace/policy";

import { getMailAdapter, type MailAdapter } from "./adapter";

export interface ResolvedMailbox {
  mailboxId: string;
  linkId: string;
  mailboxSlug: string;
  mailboxEmail: string;
  provider: MailProvider;
  policy: ResolvedPolicy;
  grantScope: string | null;
  auth: () => Promise<ConnectionAuth>;
}

const scopedBrand: unique symbol = Symbol("scoped-message");

export interface ScopedMessage {
  readonly [scopedBrand]: true;
  mailboxId: string;
  linkId: string;
  messageId: string;
  provider: MailProvider;
  auth: () => Promise<ConnectionAuth>;
}

function scoped(mailbox: ResolvedMailbox, messageId: string): ScopedMessage {
  return {
    [scopedBrand]: true,
    mailboxId: mailbox.mailboxId,
    linkId: mailbox.linkId,
    messageId,
    provider: mailbox.provider,
    auth: mailbox.auth,
  };
}

export async function adapterForMailbox(mailbox: ResolvedMailbox): Promise<MailAdapter> {
  return getMailAdapter(mailbox.provider, await mailbox.auth(), mailbox.mailboxId);
}

async function adapterForScoped(scopedMessage: ScopedMessage): Promise<MailAdapter> {
  return getMailAdapter(
    scopedMessage.provider,
    await scopedMessage.auth(),
    scopedMessage.mailboxId,
  );
}

export function scopedForMailbox(mailbox: ResolvedMailbox, messageId: string): ScopedMessage {
  return scoped(mailbox, messageId);
}

export function compositeId(mailboxId: string, messageId: string): string {
  return `${mailboxId}:${messageId}`;
}

export function resolveScopedMessage(
  mailboxes: ResolvedMailbox[],
  id: string,
  composite: boolean,
): ScopedMessage {
  if (!composite) {
    const only = mailboxes[0];
    if (!only) throw new Error("No mailbox in scope");
    return scoped(only, id);
  }

  const sep = id.indexOf(":");
  if (sep === -1) {
    throw new Error("Message id is not scoped to a mailbox");
  }
  const mailboxId = id.slice(0, sep);
  const mailbox = mailboxes.find((m) => m.mailboxId === mailboxId);
  if (!mailbox) {
    throw new Error("Message does not belong to a mailbox you can see");
  }
  return scoped(mailbox, id.slice(sep + 1));
}

export function isMailboxTag(
  token: TagToken,
  mailbox: Pick<ResolvedMailbox, "mailboxSlug" | "mailboxEmail">,
): boolean {
  const value = (tagText(token) ?? "").toLowerCase();
  return (
    value === mailbox.mailboxSlug.toLowerCase() || value === mailbox.mailboxEmail.toLowerCase()
  );
}

export function tagEmail(email: Email, mailbox: ResolvedMailbox): Email {
  return {
    ...email,
    id: compositeId(mailbox.mailboxId, email.id),
    threadId: email.threadId ? compositeId(mailbox.mailboxId, email.threadId) : undefined,
    mailboxId: mailbox.mailboxId,
    mailboxSlug: mailbox.mailboxSlug,
    mailboxEmail: mailbox.mailboxEmail,
  };
}

const cursorSchema = z.object({
  tokens: z.record(z.string(), z.string().nullable()),
  watermark: z.number().optional(),
  emittedAtWatermark: z.array(z.string()).optional(),
});

type Cursor = z.infer<typeof cursorSchema>;

function decodeCursor(pageToken?: string): Cursor | null {
  if (!pageToken) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(pageToken, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor): string | undefined {
  if (Object.keys(cursor.tokens).length === 0) return undefined;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function millis(email: Email): number {
  const ms = new Date(email.date).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

interface FanOutResult {
  pages: { mailbox: ResolvedMailbox; emails: Email[]; next?: string }[];
  mailboxErrors: MailboxError[];
}

const MAILBOX_TIMEOUT_MS = 20_000;
const SLOW_MS = 1000;

function mailboxBudget(max: number | undefined, mailboxes: number): number | undefined {
  if (max === undefined || mailboxes <= 1) return max;
  return Math.min(max, Math.ceil(max / mailboxes) + 5);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function fanOut(
  mailboxes: ResolvedMailbox[],
  run: (mailbox: ResolvedMailbox, adapter: MailAdapter) => Promise<MessagesResponse>,
): Promise<FanOutResult> {
  const settled = await Promise.all(
    mailboxes.map(async (mailbox) => {
      const startedAt = Date.now();
      try {
        const res = await withTimeout(
          (async () => run(mailbox, await adapterForMailbox(mailbox)))(),
          MAILBOX_TIMEOUT_MS,
        );
        const elapsed = Date.now() - startedAt;
        if (elapsed > SLOW_MS) {
          console.warn(`[mail/aggregate] ${mailbox.provider} mailbox answered in ${elapsed}ms`);
        }
        return { mailbox, res, error: null as string | null };
      } catch (err) {
        console.warn(
          `[mail/aggregate] ${mailbox.provider} mailbox failed after ${Date.now() - startedAt}ms`,
        );
        return {
          mailbox,
          res: null,
          error: sanitizeError(err),
        };
      }
    }),
  );

  const pages: { mailbox: ResolvedMailbox; emails: Email[]; next?: string }[] = [];
  const mailboxErrors: MailboxError[] = [];

  for (const { mailbox, res, error } of settled) {
    if (error !== null || !res) {
      mailboxErrors.push({
        mailboxId: mailbox.mailboxId,
        mailboxEmail: mailbox.mailboxEmail,
        error: error ?? "Request failed",
      });
      continue;
    }
    pages.push({
      mailbox,
      emails: (res.emails ?? []).map((email) => tagEmail(email, mailbox)),
      next: res.nextPageToken,
    });
  }

  return { pages, mailboxErrors };
}

function mergePage(
  fan: FanOutResult,
  prev: Cursor | null,
  requested: Record<string, string | undefined>,
): MessagesResponse {
  const previousWatermark = prev?.watermark;
  const alreadyEmitted = new Set(prev?.emittedAtWatermark ?? []);

  for (const page of fan.pages) {
    page.emails = page.emails.filter((email) => {
      if (previousWatermark === undefined) return true;
      const ms = millis(email);
      if (ms > previousWatermark) return false;
      if (ms === previousWatermark && alreadyEmitted.has(email.id)) return false;
      return true;
    });
    page.emails.sort((a, b) => millis(b) - millis(a));
  }

  const boundaries = fan.pages
    .map((page) => (page.next ? page.emails.at(-1) : undefined))
    .filter((email) => email !== undefined)
    .map(millis);
  const boundary = boundaries.length ? Math.max(...boundaries) : null;

  const emails: Email[] = [];
  const tokens: Record<string, string | null> = {};

  for (const page of fan.pages) {
    const emitted =
      boundary === null ? page.emails : page.emails.filter((email) => millis(email) >= boundary);
    emails.push(...emitted);

    const fullyDrained = emitted.length === page.emails.length;
    if (fullyDrained) {
      if (page.next) tokens[page.mailbox.mailboxId] = page.next;
    } else {
      tokens[page.mailbox.mailboxId] = requested[page.mailbox.mailboxId] ?? null;
    }
  }

  emails.sort((a, b) => millis(b) - millis(a));

  const cursor: Cursor = { tokens };
  if (boundary !== null) {
    cursor.watermark = boundary;
    cursor.emittedAtWatermark = emails
      .filter((email) => millis(email) === boundary)
      .map((email) => email.id);
  }

  return {
    emails,
    nextPageToken: encodeCursor(cursor),
    mailboxErrors: fan.mailboxErrors.length ? fan.mailboxErrors : undefined,
  };
}

const unsupported = (op: string): never => {
  throw new Error(`Pick a mailbox to ${op} from`);
};

export function getAggregateAdapter(mailboxes: ResolvedMailbox[]): MailAdapter {
  const forId = async (id: string) => {
    const target = resolveScopedMessage(mailboxes, id, true);
    return { target, adapter: await adapterForScoped(target) };
  };

  return {
    async listMessages(folder: MailFolder, pageToken?: string, max?: number) {
      const cursor = decodeCursor(pageToken);
      if (pageToken && !cursor) {
        throw new Error("That page link expired — reload the folder");
      }

      const active = cursor ? mailboxes.filter((m) => m.mailboxId in cursor.tokens) : mailboxes;

      const requested: Record<string, string | undefined> = {};
      for (const mailbox of active) {
        requested[mailbox.mailboxId] = cursor?.tokens[mailbox.mailboxId] ?? undefined;
      }

      const budget = mailboxBudget(max, active.length);
      const fan = await fanOut(active, (mailbox, adapter) =>
        adapter.listMessages(folder, requested[mailbox.mailboxId], budget),
      );
      return mergePage(fan, cursor, requested);
    },

    async search(query: string) {
      const fan = await fanOut(mailboxes, (_mailbox, adapter) => adapter.search(query));
      return mergePage(fan, null, {});
    },

    async searchAst(search: AstSearch<Email>) {
      const cursor = decodeCursor(search.cursor);
      if (search.cursor && !cursor) {
        throw new Error("That page of results expired — search again");
      }
      const targets = mailboxes.flatMap((mailbox) => {
        const query = bindTags(search.query, (token) =>
          tagKey(token) === "mailbox" ? isMailboxTag(token, mailbox) : null,
        );
        return query === false ? [] : [{ mailbox, query }];
      });
      const active = cursor
        ? targets.filter(({ mailbox }) => mailbox.mailboxId in cursor.tokens)
        : targets;

      const requested: Record<string, string | undefined> = {};
      for (const { mailbox } of active) {
        requested[mailbox.mailboxId] = cursor?.tokens[mailbox.mailboxId] ?? undefined;
      }

      const queries = new Map(active.map((s) => [s.mailbox.mailboxId, s.query]));
      const fan = await fanOut(
        active.map((s) => s.mailbox),
        (mailbox, adapter) =>
          adapter.searchAst({
            ...search,
            query: queries.get(mailbox.mailboxId) ?? true,
            cursor: requested[mailbox.mailboxId],
            accept: (residual, emails) =>
              search.accept(
                residual,
                emails.map((email) => ({
                  ...email,
                  mailboxId: mailbox.mailboxId,
                  mailboxSlug: mailbox.mailboxSlug,
                  mailboxEmail: mailbox.mailboxEmail,
                })),
              ),
          }),
      );
      return mergePage(fan, cursor, requested);
    },

    async getMessage(id: string) {
      const { target, adapter } = await forId(id);
      const email = await adapter.getMessage(target.messageId);
      return {
        ...email,
        id,
        threadId: email.threadId ? compositeId(target.mailboxId, email.threadId) : undefined,
        mailboxId: target.mailboxId,
      };
    },

    async getThread(threadId: string) {
      const { target, adapter } = await forId(threadId);
      const mailbox = mailboxes.find((m) => m.mailboxId === target.mailboxId);
      const messages = await adapter.getThread(target.messageId);
      return mailbox ? messages.map((m) => tagEmail(m, mailbox)) : messages;
    },

    async getRaw(id: string) {
      const { target, adapter } = await forId(id);
      return adapter.getRaw(target.messageId);
    },

    async deleteMessage(id: string) {
      const { target, adapter } = await forId(id);
      const moved = await adapter.deleteMessage(target.messageId);
      return moved === null ? null : compositeId(target.mailboxId, moved);
    },

    async starMessage(id: string, starred: boolean) {
      const { target, adapter } = await forId(id);
      return adapter.starMessage(target.messageId, starred);
    },

    async markRead(id: string, read: boolean) {
      const { target, adapter } = await forId(id);
      return adapter.markRead(target.messageId, read);
    },

    async archiveMessage(id: string) {
      const { target, adapter } = await forId(id);
      return compositeId(target.mailboxId, await adapter.archiveMessage(target.messageId));
    },

    async restoreMessage(id: string) {
      const { target, adapter } = await forId(id);
      return compositeId(target.mailboxId, await adapter.restoreMessage(target.messageId));
    },

    async getUnsubscribeInfo(id: string) {
      const { target, adapter } = await forId(id);
      return adapter.getUnsubscribeInfo(target.messageId);
    },

    async getHeaders(id: string, names: string[]) {
      const { target, adapter } = await forId(id);
      return adapter.getHeaders(target.messageId, names);
    },

    async listAttachments(id: string) {
      const { target, adapter } = await forId(id);
      return adapter.listAttachments(target.messageId);
    },

    async downloadAttachment(id: string, attachmentId: string) {
      const { target, adapter } = await forId(id);
      return adapter.downloadAttachment(target.messageId, attachmentId);
    },

    async batchMarkRead(ids: string[], read: boolean) {
      await runGrouped(mailboxes, ids, (adapter, scopedIds) =>
        adapter.batchMarkRead(scopedIds, read),
      );
    },

    async batchDelete(ids: string[]) {
      const movedIds = new Map<string, string>();
      await runGrouped(mailboxes, ids, async (adapter, scopedIds, mailbox) => {
        const moved = await adapter.batchDelete(scopedIds);
        for (const [from, to] of moved) {
          movedIds.set(compositeId(mailbox.mailboxId, from), compositeId(mailbox.mailboxId, to));
        }
      });
      return movedIds;
    },

    async listAllInFolder(folder: MailFolder) {
      const perMailbox = await Promise.allSettled(
        mailboxes.map(async (mailbox) => {
          const adapter = await adapterForMailbox(mailbox);
          const ids = await adapter.listAllInFolder(folder);
          return ids.map((id) => compositeId(mailbox.mailboxId, id));
        }),
      );
      if (perMailbox.every((r) => r.status === "rejected")) {
        throw new Error("Could not list any mailbox in that folder");
      }
      return perMailbox.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    },

    sendMessage: () => unsupported("send"),
    createDraft: () => unsupported("draft"),
    updateDraft: () => unsupported("draft"),
    deleteDraft: () => unsupported("draft"),
  };
}

async function runGrouped(
  mailboxes: ResolvedMailbox[],
  ids: string[],
  run: (adapter: MailAdapter, ids: string[], mailbox: ResolvedMailbox) => Promise<void>,
): Promise<void> {
  const groups = new Map<string, { mailbox: ResolvedMailbox; ids: string[] }>();
  for (const id of ids) {
    const target = resolveScopedMessage(mailboxes, id, true);
    const mailbox = mailboxes.find((m) => m.mailboxId === target.mailboxId);
    if (!mailbox) continue;
    const group = groups.get(target.mailboxId) ?? { mailbox, ids: [] };
    group.ids.push(target.messageId);
    groups.set(target.mailboxId, group);
  }
  const settled = await Promise.allSettled(
    Array.from(groups.values()).map(async ({ mailbox, ids: scopedIds }) =>
      run(await adapterForMailbox(mailbox), scopedIds, mailbox),
    ),
  );

  const failures = settled.filter((r) => r.status === "rejected");
  const firstFailure = failures[0];
  if (!firstFailure) return;
  if (failures.length === settled.length) {
    throw firstFailure.reason instanceof Error ? firstFailure.reason : new Error("Request failed");
  }
  for (const failure of failures) {
    console.error("[mail-aggregate] batch failed for one mailbox", failure.reason);
  }
}
