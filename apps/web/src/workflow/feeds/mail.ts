import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { mailValue, readMail } from "@/ops/values";
import { isMailFolder, type MailFolder } from "@/types/mail";

import { authorizeMailbox } from "../authorization";
import type { FeedCursor } from "../runtime";
import {
  type FeedContext,
  type FeedEvent,
  type FeedPoll,
  freshCursor,
  literalParam,
  withAbort,
} from "./shared";

const SCAN_PAGES = 3;
const SWEEP_EVERY_SCANS = 10;
const SWEEP_MAX_PAGES = 20;
const SCAN_PAGE_SIZE = 50;
const SEEN_LIMIT = 1_000;
const SNAPSHOT_LIMIT = 500;
const DELTA_LIMIT = 200;
const FULL_FIELDS = /\b(body|attachments|hasAttachments)\b/;

function folderFor(ctx: FeedContext): MailFolder {
  if (ctx.trigger.kind === "trigger.mail.sent") return "sent";
  if (ctx.trigger.kind === "trigger.mail.starred") return "starred";
  const folder = literalParam(ctx.node, "folder") || "inbox";
  return isMailFolder(folder) ? folder : "inbox";
}

function needsFullMessage(ctx: FeedContext): boolean {
  const filter = ctx.node.params.filter;
  return filter?.kind === "expr" && FULL_FIELDS.test(filter.cel);
}

export async function pollMail(ctx: FeedContext): Promise<FeedPoll> {
  const mailboxId = literalParam(ctx.node, "mailbox");
  const folder = folderFor(ctx);
  const scope = `mail:${mailboxId}:${folder}`;
  const cursor = ctx.cursors.get(scope) ?? freshCursor(scope, ctx.now);
  const authorized = await authorizeMailbox({
    definition: ctx.definition,
    principal: ctx.principal,
    mailboxId,
  });
  if (!authorized.ok) return { events: [], baseline: false, cursor, error: authorized.reason };
  const handle = {
    mailboxId,
    email: authorized.value.email,
    adapter: authorized.value.adapter,
  };
  const full = needsFullMessage(ctx);
  const toValue = async (email: Parameters<typeof mailValue>[1]) => {
    const summary = mailValue(handle, email);
    const value = full ? await readMail(handle, email.id, email) : summary;
    return { ...value, hydrate: { kind: "mail", mailboxId, id: email.id } };
  };

  const byId = async (id: string) => {
    const value = full
      ? await readMail(handle, id)
      : mailValue(handle, { ...(await handle.adapter.getMessage(id)), id });
    return { ...value, hydrate: { kind: "mail", mailboxId, id } };
  };
  const delta = await pollByChanges(ctx, cursor, handle, folder, byId);
  if (delta === "unsupported") {
    if (folder === "starred") return pollStarred(ctx, cursor, handle, toValue);
    return scanListing(ctx, cursor, handle, folder, toValue);
  }
  if (delta.expired) {
    const listed =
      folder === "starred"
        ? await pollStarred(ctx, cursor, handle, toValue)
        : await scanListing(
            ctx,
            { ...cursor, baselined: (cursor.seen ?? []).length > 0, sweepPages: 0 },
            handle,
            folder,
            toValue,
          );
    return { ...listed, cursor: { ...listed.cursor, token: delta.token } };
  }
  return delta.poll;
}

type MailHandle = {
  mailboxId: string;
  email: string;
  adapter: Parameters<typeof mailValue>[0]["adapter"];
};

type DeltaResult =
  | "unsupported"
  | { expired: true; token: string }
  | { expired: false; poll: FeedPoll };

async function pollByChanges(
  ctx: FeedContext,
  cursor: FeedCursor,
  handle: MailHandle,
  folder: MailFolder,
  byId: (id: string) => Promise<unknown>,
): Promise<DeltaResult> {
  const { adapter } = handle;
  if (!adapter.changes) return "unsupported";
  const changes = (target: MailFolder, token: string | null) =>
    adapter.changes ? adapter.changes(target, token) : Promise.resolve(null);
  const updatedAt = ctx.now.toISOString();
  if (!cursor.token) {
    const first = await withAbort(changes(folder, null), ctx.signal);
    if (!first) return "unsupported";
    return {
      expired: false,
      poll: {
        events: [],
        baseline: !cursor.baselined,
        cursor: {
          ...cursor,
          token: first.cursor,
          baselined: true,
          scans: cursor.scans + 1,
          updatedAt,
        },
      },
    };
  }
  const changed = await withAbort(changes(folder, cursor.token), ctx.signal);
  if (!changed) return "unsupported";
  if (changed.expired) {
    const fresh = await withAbort(changes(folder, null), ctx.signal);
    return { expired: true, token: fresh?.cursor ?? "" };
  }
  const seen = new Set(cursor.seen ?? []);
  const unique = [...new Set(changed.ids)];
  const fresh = folder === "starred" ? unique : unique.filter((id) => !seen.has(id));
  const events: FeedEvent[] = [];
  let error: string | undefined;
  for (const id of fresh.slice(0, DELTA_LIMIT)) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each changed message loads one at a time, bounded by DELTA_LIMIT
      const value = await byId(id);
      const key =
        folder === "starred"
          ? `star:${handle.mailboxId}:${id}:${cursor.scans}`
          : `mail:${handle.mailboxId}:${id}`;
      events.push({ key, at: ctx.now, value });
    } catch (err) {
      error = sanitizeError(err);
    }
  }
  if (fresh.length > DELTA_LIMIT) {
    error = `${fresh.length - DELTA_LIMIT} changed message(s) were skipped in one check`;
  }
  return {
    expired: false,
    poll: {
      events,
      baseline: false,
      error,
      cursor: {
        ...cursor,
        token: changed.cursor,
        seen: [...(cursor.seen ?? []), ...fresh].slice(-SEEN_LIMIT),
        scans: cursor.scans + 1,
        updatedAt,
      },
    },
  };
}

async function scanListing(
  ctx: FeedContext,
  cursor: FeedCursor,
  handle: MailHandle,
  folder: MailFolder,
  toValue: (email: Parameters<typeof mailValue>[1]) => Promise<unknown>,
): Promise<FeedPoll> {
  const { mailboxId } = handle;
  const scope = cursor.scope;
  const baselining = !cursor.baselined;
  const sweeping =
    baselining || cursor.sweepPages !== undefined || cursor.scans % SWEEP_EVERY_SCANS === 0;
  const seen = new Set(cursor.seen ?? []);
  const committed: string[] = [];
  const events: FeedEvent[] = [];
  let progress = { token: cursor.pageToken, pages: cursor.sweepPages ?? 0 };
  let exhausted = false;
  let idle = false;
  let error: string | undefined;

  try {
    for (let page = 0; page < SCAN_PAGES; page += 1) {
      if (ctx.signal?.aborted) throw new Error("The tick ran out of budget");
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
      const listed = await withAbort(
        handle.adapter.listMessages(folder, progress.token, SCAN_PAGE_SIZE),
        ctx.signal,
      );
      let unseen = 0;
      for (const email of listed.emails ?? []) {
        if (!email.id || seen.has(email.id)) continue;
        unseen += 1;
        const at = email.date ? new Date(email.date) : ctx.now;
        events.push({
          key: `mail:${mailboxId}:${email.id}`,
          at: Number.isNaN(at.getTime()) ? ctx.now : at,
          // oxlint-disable-next-line eslint/no-await-in-loop -- a full message loads one at a time, bounded by the page size
          value: baselining ? mailValue(handle, email) : await toValue(email),
        });
        seen.add(email.id);
        committed.push(email.id);
      }
      progress = { token: listed.nextPageToken, pages: progress.pages + 1 };
      if (!progress.token) {
        exhausted = true;
        break;
      }
      if (!baselining && sweeping && progress.pages >= SWEEP_MAX_PAGES) {
        exhausted = true;
        break;
      }
      if (!sweeping && unseen === 0) {
        idle = true;
        break;
      }
    }
  } catch (err) {
    error = sanitizeError(err);
    if (progress.token === cursor.pageToken && cursor.pageToken)
      progress = { token: undefined, pages: 0 };
  }

  const finished = exhausted || idle;
  return {
    events,
    baseline: baselining,
    error,
    cursor: {
      scope,
      pageToken: finished ? undefined : progress.token,
      seen: [...(cursor.seen ?? []), ...committed].slice(-SEEN_LIMIT),
      baselined: cursor.baselined || (baselining && exhausted),
      sweepPages: sweeping && !finished ? progress.pages : undefined,
      scans: finished ? cursor.scans + 1 : cursor.scans,
      updatedAt: ctx.now.toISOString(),
    },
  };
}

async function pollStarred(
  ctx: FeedContext,
  cursor: FeedCursor,
  handle: { mailboxId: string; email: string; adapter: Parameters<typeof mailValue>[0]["adapter"] },
  toValue: (email: Parameters<typeof mailValue>[1]) => Promise<unknown>,
): Promise<FeedPoll> {
  const listed = await withAbort(
    handle.adapter.listMessages("starred", undefined, SNAPSHOT_LIMIT),
    ctx.signal,
  );
  const current = (listed.emails ?? []).filter((email) => email.id);
  const previous = new Set(cursor.seen ?? []);
  const baselining = !cursor.baselined;
  const events: FeedEvent[] = [];
  if (!baselining) {
    for (const email of current) {
      if (previous.has(email.id)) continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- one value per newly starred message
      const value = await toValue(email);
      events.push({
        key: `star:${handle.mailboxId}:${email.id}:${cursor.scans}`,
        at: ctx.now,
        value,
      });
    }
  }
  return {
    events,
    baseline: false,
    cursor: {
      scope: cursor.scope,
      seen: current.map((email) => email.id),
      baselined: true,
      scans: cursor.scans + 1,
      updatedAt: ctx.now.toISOString(),
    },
  };
}
