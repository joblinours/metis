import "server-only";
import { listMutedThreads, muteThreads, unmuteThreads } from "@/mail/mute";
import {
  addReadLater as addToReadLater,
  listReadLater as listReadLaterIds,
  removeReadLater as removeFromReadLater,
} from "@/mail/read-later";
import { sendingMailbox } from "@/mail/session";
import { scanSubscriptions, unsubscribeSenders } from "@/mail/subscriptions";
import type { DraftPayload } from "@/types/mail";
import {
  cancelScheduledSend,
  cancelSnooze as cancelSnoozeRun,
  listScheduledMail,
  listSnoozedEmails,
  retryScheduledSend,
  scheduleOutgoing,
  snoozeMessage,
  unsnoozeMessage,
} from "@/workflow/builtins";

import { type AgentMailbox, mailScopeFor, type WorkspaceCtx } from "../runtime-context";

export async function snoozeEmail(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { id: string; wakeAt: string },
) {
  const target = mailbox.scope(args.id);
  const result = await snoozeMessage({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    linkId: target.linkId,
    target: {
      mailboxId: target.mailboxId,
      messageId: target.messageId,
      threadId: args.id,
    },
    wakeAt: new Date(args.wakeAt),
  });
  if (!result.ok || !result.wakeAt) {
    return { error: result.error ?? "Could not snooze that email" };
  }
  return {
    snoozed: true,
    mailboxId: mailbox.mailboxId,
    id: args.id,
    wakeAt: result.wakeAt,
  };
}

export async function cancelSnooze(mailbox: AgentMailbox, id: string) {
  const target = mailbox.scope(id);
  const result = await cancelSnoozeRun({
    mailboxId: target.mailboxId,
    messageId: target.messageId,
  });
  if (!result.cancelled) {
    return { error: result.reason ?? "That snooze could not be cancelled" };
  }
  return {
    cancelled: true,
    mailboxId: mailbox.mailboxId,
    id,
    note: "The email stays archived; use unsnoozeEmail to bring it back now.",
  };
}

export async function unsnoozeEmail(mailbox: AgentMailbox, id: string) {
  const target = mailbox.scope(id);
  const result = await unsnoozeMessage({
    adapter: mailbox.adapter,
    id,
    target,
  });
  if (!result.cancelled) {
    return { error: result.reason ?? "That snooze could not be cancelled" };
  }
  return { unsnoozed: true, mailboxId: mailbox.mailboxId, id };
}

export async function listSnoozed(mailbox: AgentMailbox) {
  const emails = await listSnoozedEmails(mailbox);
  return {
    mailbox: mailbox.email,
    count: emails.length,
    emails: emails.map((e) => ({
      id: e.id,
      threadId: e.threadId,
      from: e.fromName || e.from,
      subject: e.subject,
      wakeAt: e.wakeAt,
      status: e.status,
      error: e.error,
    })),
  };
}

export async function scheduleEmail(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  args: { payload: DraftPayload; scheduledFor: string },
) {
  const mail = mailScopeFor(ctx, mailbox);
  const from = await sendingMailbox(mail);
  const scheduled = await scheduleOutgoing({
    mail,
    from,
    payload: args.payload,
    scheduledFor: args.scheduledFor,
  });
  if ("error" in scheduled) return scheduled;
  return {
    scheduled: true,
    mailboxId: mailbox.mailboxId,
    scheduleId: scheduled.id,
    scheduledFor: scheduled.scheduledFor,
    note: "Nothing is sent now; the workflow runner sends it at that time.",
  };
}

export async function listScheduled(ctx: WorkspaceCtx, mailbox: AgentMailbox) {
  const items = await listScheduledMail([mailbox.mailboxId], ctx.userId);
  return {
    mailbox: mailbox.email,
    count: items.length,
    scheduled: items.map((item) => ({
      scheduleId: item.id,
      scheduledFor: item.scheduledFor.toISOString(),
      status: item.status,
      sent: item.sent,
      unconfirmed: item.unconfirmed,
      subject: item.subject,
      to: item.payload?.to ?? [],
      scheduledBy: item.scheduledByName,
      scheduledByYou: item.scheduledByMe,
      error: item.error,
    })),
  };
}

export async function cancelScheduled(mailbox: AgentMailbox, scheduleId: string) {
  const result = await cancelScheduledSend(scheduleId, [mailbox.mailboxId]);
  if (!result.cancelled) {
    return { error: result.reason ?? "That message could not be called back" };
  }
  return { cancelled: true, mailboxId: mailbox.mailboxId, scheduleId };
}

export async function retryScheduled(mailbox: AgentMailbox, scheduleId: string) {
  const result = await retryScheduledSend(scheduleId, [mailbox.mailboxId]);
  if (!result) return { error: "That scheduled message is gone" };
  if (result.state === "refused") return { error: result.message };
  return {
    state: result.state,
    mailboxId: mailbox.mailboxId,
    scheduleId,
    message: result.message,
  };
}

export async function muteThread(ctx: WorkspaceCtx, mailbox: AgentMailbox, threadId: string) {
  await muteThreads(mailScopeFor(ctx, mailbox), [threadId]);
  return { muted: true, mailboxId: mailbox.mailboxId, threadId };
}

export async function unmuteThread(ctx: WorkspaceCtx, mailbox: AgentMailbox, threadId: string) {
  await unmuteThreads(mailScopeFor(ctx, mailbox), [threadId]);
  return { muted: false, mailboxId: mailbox.mailboxId, threadId };
}

export async function listMuted(ctx: WorkspaceCtx, mailbox: AgentMailbox) {
  const threadIds = await listMutedThreads(mailScopeFor(ctx, mailbox));
  return { mailbox: mailbox.email, count: threadIds.length, threadIds };
}

export async function addReadLater(ctx: WorkspaceCtx, mailbox: AgentMailbox, id: string) {
  await addToReadLater(mailScopeFor(ctx, mailbox), id);
  return { readLater: true, mailboxId: mailbox.mailboxId, id };
}

export async function removeReadLater(ctx: WorkspaceCtx, mailbox: AgentMailbox, id: string) {
  await removeFromReadLater(mailScopeFor(ctx, mailbox), id);
  return { readLater: false, mailboxId: mailbox.mailboxId, id };
}

export async function listReadLater(ctx: WorkspaceCtx, mailbox: AgentMailbox) {
  const ids = await listReadLaterIds(mailScopeFor(ctx, mailbox));
  return { mailbox: mailbox.email, count: ids.length, ids };
}

export async function listSubscriptions(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  scanLimit: number,
) {
  const { senders, scanned } = await scanSubscriptions(mailScopeFor(ctx, mailbox), scanLimit);
  return {
    mailbox: mailbox.email,
    scanned,
    count: senders.length,
    senders: senders.map((s) => ({
      senderEmail: s.senderEmail,
      senderName: s.senderName,
      messageId: s.messageId,
      count: s.count,
      latestSubject: s.latestSubject,
      latestDate: s.latestDate,
      methods: s.methods,
      unsubscribed: s.unsubscribedStatus,
    })),
  };
}

export async function unsubscribe(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  items: { messageId: string; senderEmail: string }[],
) {
  const results = await unsubscribeSenders(mailScopeFor(ctx, mailbox), items);
  return { mailboxId: mailbox.mailboxId, results };
}
