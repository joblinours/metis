import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { looksTextual, TEXT_LIMIT } from "@/lib/file-utils";
import { htmlToText, truncate } from "@/lib/utils";
import { isParsableAttachment, parseAttachment } from "@/mail/attachment-data";
import { suggestContacts } from "@/mail/contacts";
import { readRawMessage } from "@/mail/raw";
import { summarizeThread as summarizeConversation } from "@/mail/thread-summary";
import type { DraftPayload, Email, MailFolder } from "@/types/mail";

import { type AgentMailbox, mailScopeFor, type WorkspaceCtx } from "../runtime-context";

export function emailSummary(e: Email) {
  return {
    id: e.id,
    threadId: e.threadId,
    from: e.fromName || e.from,
    subject: e.subject,
    date: e.date,
    isRead: e.isRead,
    isStarred: e.isStarred,
    snippet: e.snippet.slice(0, 120),
  };
}

function searchHit(e: Email, mailbox: AgentMailbox) {
  return {
    mailboxId: mailbox.mailboxId,
    mailbox: mailbox.email,
    ...emailSummary(e),
  };
}

export async function listMessages(
  mailbox: AgentMailbox,
  args: { folder: MailFolder; limit: number; pageToken?: string },
) {
  const data = await mailbox.adapter.listMessages(args.folder, args.pageToken, args.limit);
  return {
    mailbox: mailbox.email,
    count: data.emails.length,
    nextPageToken: data.nextPageToken,
    emails: data.emails.map(emailSummary),
  };
}

export async function aggregateInbox(mailboxes: AgentMailbox[], perMailbox: number) {
  const groups = await Promise.all(
    mailboxes.map(async (m) => {
      try {
        const data = await m.adapter.listMessages("inbox", undefined, perMailbox);
        return data.emails.map((e) => searchHit(e, m));
      } catch (err) {
        console.error("[agent-tool]", err);
        return [
          {
            mailboxId: m.mailboxId,
            mailbox: m.email,
            error: sanitizeError(err),
          },
        ];
      }
    }),
  );
  const emails = groups.flat();
  return { mailboxes: mailboxes.length, count: emails.length, emails };
}

export async function searchAcross(mailboxes: AgentMailbox[], query: string) {
  const groups = await Promise.all(
    mailboxes.map(async (m) => {
      try {
        const data = await m.adapter.search(query);
        return data.emails.map((e) => searchHit(e, m));
      } catch {
        return [];
      }
    }),
  );
  const emails = groups.flat();
  return { count: emails.length, emails };
}

export async function getBody(mailbox: AgentMailbox, id: string, maxChars = 8000) {
  try {
    const data = await mailbox.adapter.getMessage(id);
    const text = data.bodyText ?? (data.bodyHtml ? htmlToText(data.bodyHtml) : "");
    return {
      id,
      from: data.fromName || data.from,
      to: data.to,
      subject: data.subject,
      date: data.date,
      hasContent: text.length > 0,
      body: truncate(text, maxChars),
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { id, error: sanitizeError(err) };
  }
}

export async function getThread(mailbox: AgentMailbox, threadId: string) {
  try {
    const emails = await mailbox.adapter.getThread(threadId);
    return {
      mailbox: mailbox.email,
      threadId,
      count: emails.length,
      emails: emails.map(emailSummary),
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { threadId, error: sanitizeError(err) };
  }
}

export async function star(mailbox: AgentMailbox, id: string, starred: boolean) {
  await mailbox.adapter.starMessage(id, starred);
  return { success: true, mailboxId: mailbox.mailboxId, id, starred };
}

export async function markRead(mailbox: AgentMailbox, ids: string[], read: boolean) {
  await mailbox.adapter.batchMarkRead(ids, read);
  return { success: true, mailboxId: mailbox.mailboxId, ids, read };
}

export async function archive(mailbox: AgentMailbox, id: string) {
  await mailbox.adapter.archiveMessage(id);
  return { success: true, mailboxId: mailbox.mailboxId, id };
}

export async function restore(mailbox: AgentMailbox, id: string) {
  await mailbox.adapter.restoreMessage(id);
  return { success: true, mailboxId: mailbox.mailboxId, id };
}

export async function trash(mailbox: AgentMailbox, ids: string[]) {
  await mailbox.adapter.batchDelete(ids);
  return { deleted: ids.length, mailboxId: mailbox.mailboxId, ids };
}

export async function send(mailbox: AgentMailbox, payload: DraftPayload) {
  await mailbox.adapter.sendMessage(payload);
  return {
    sent: true,
    mailboxId: mailbox.mailboxId,
    to: payload.to,
    subject: payload.subject,
  };
}

export async function createDraft(mailbox: AgentMailbox, payload: DraftPayload) {
  const { id } = await mailbox.adapter.createDraft(payload);
  return { success: true, mailboxId: mailbox.mailboxId, draftId: id };
}

export async function updateDraft(mailbox: AgentMailbox, draftId: string, payload: DraftPayload) {
  const updated = await mailbox.adapter.updateDraft(draftId, payload);
  return { success: true, mailboxId: mailbox.mailboxId, draftId: updated.id };
}

export async function deleteDraft(mailbox: AgentMailbox, draftId: string) {
  await mailbox.adapter.deleteDraft(draftId);
  return { deleted: true, mailboxId: mailbox.mailboxId, draftId };
}

export async function listAttachments(mailbox: AgentMailbox, id: string) {
  const attachments = await mailbox.adapter.listAttachments(id);
  return {
    mailboxId: mailbox.mailboxId,
    id,
    count: attachments.length,
    attachments: attachments.map((a) => ({
      attachmentId: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}

export async function getAttachmentText(mailbox: AgentMailbox, id: string, attachmentId: string) {
  const attachments = await mailbox.adapter.listAttachments(id);
  const meta = attachments.find((a) => a.id === attachmentId);
  if (!meta) {
    return {
      error: `Unknown attachmentId "${attachmentId}" on this email. These are all of them: ${
        attachments.map((a) => `${a.id} (${a.filename})`).join(", ") || "none"
      }`,
    };
  }

  const parsable = isParsableAttachment(meta);
  if (!parsable && !looksTextual(meta.filename, meta.mimeType)) {
    return {
      error:
        "That attachment is not readable as text. PDFs, calendar invites, contact cards, wallet passes, forwarded emails and plain-text files can be read.",
      filename: meta.filename,
      mimeType: meta.mimeType,
    };
  }

  const downloaded = await mailbox.adapter.downloadAttachment(id, attachmentId);
  if (!downloaded) return { error: "That attachment is no longer available" };

  const parsed = parsable ? await parseAttachment(meta, downloaded.buffer) : null;
  const text = parsed
    ? JSON.stringify(parsed.data)
    : downloaded.buffer.subarray(0, TEXT_LIMIT * 4).toString("utf-8");

  return {
    attachmentId,
    filename: meta.filename,
    kind: parsed?.label ?? "text",
    truncated: text.length > TEXT_LIMIT,
    text: truncate(text, TEXT_LIMIT),
  };
}

export async function searchContacts(
  userId: string,
  mailbox: AgentMailbox,
  args: { query?: string; limit: number },
) {
  const contacts = await suggestContacts({
    userId,
    mailboxIds: [mailbox.mailboxId],
    adapter: mailbox.adapter,
  });
  const needle = args.query?.trim().toLowerCase();
  const matched = needle
    ? contacts.filter((c) => c.email.includes(needle) || c.name?.toLowerCase().includes(needle))
    : contacts;
  return {
    mailbox: mailbox.email,
    count: Math.min(matched.length, args.limit),
    contacts: matched.slice(0, args.limit),
  };
}

const RAW_LIMIT = 50_000;

export async function getRawEmail(mailbox: AgentMailbox, id: string) {
  const raw = await readRawMessage(mailbox.adapter, id);
  return {
    mailboxId: mailbox.mailboxId,
    id,
    truncated: raw.length > RAW_LIMIT,
    raw: truncate(raw, RAW_LIMIT),
  };
}

export async function summarizeThread(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { id: string; threadId?: string },
) {
  const { cards } = await summarizeConversation(mailScopeFor(ctx, mailbox), args.id, args.threadId);
  return {
    mailboxId: mailbox.mailboxId,
    id: args.id,
    count: cards.length,
    cards,
    note: cards.length === 0 ? "Nothing in this conversation needed a summary card." : undefined,
  };
}
