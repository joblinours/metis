import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { MailAdapter } from "@/mail/adapter";
import { compositeId } from "@/mail/aggregate";
import type { MailScope } from "@/mail/session";
import type { SnoozedEmail } from "@/server/schema";
import type { Email } from "@/types/mail";

import { newNodeId } from "../graph";
import type { RunStatus, WorkflowGraph } from "../schema";
import {
  type CancelResult,
  cancelBuiltinWorkflow,
  findLiveTarget,
  hasInFlightRun,
  listBuiltins,
  listNodeRuns,
  listTriggers,
  loadDefinition,
  nodeUnresolvedFor,
  rescheduleOnce,
  saveDefinition,
  softDeleteDefinition,
} from "../store";
import { runNow } from "../tick";
import { requestManualRun } from "../triggers";

interface SnoozeTarget {
  mailboxId: string;
  messageId: string;
  threadId?: string;
}

function snoozeGraph(target: SnoozeTarget, wakeAt: Date): WorkflowGraph {
  const manual = newNodeId();
  const archiveSource = newNodeId();
  const archive = newNodeId();
  const wake = newNodeId();
  const restoreSource = newNodeId();
  const restore = newNodeId();

  const source = (id: string, y: number) =>
    ({
      id,
      kind: "mailbox.source" as const,
      position: { x: 0, y },
      mailboxId: target.mailboxId,
      operation: "message" as const,
      folder: "inbox" as const,
      limit: 1,
      messageId: target.messageId,
      threadId: target.threadId,
    }) satisfies WorkflowGraph["nodes"][number];

  return {
    nodes: [
      { id: manual, kind: "trigger.manual", position: { x: 0, y: 0 } },
      source(archiveSource, 170),
      { id: archive, kind: "action.archive", position: { x: 0, y: 340 } },
      {
        id: wake,
        kind: "trigger.once",
        position: { x: 320, y: 0 },
        at: wakeAt.toISOString(),
      },
      { ...source(restoreSource, 170), position: { x: 320, y: 170 } },
      { id: restore, kind: "action.restore", position: { x: 320, y: 340 } },
    ],
    edges: [
      {
        id: `${manual}:out->${archiveSource}`,
        source: manual,
        sourceHandle: "out",
        target: archiveSource,
      },
      {
        id: `${archiveSource}:out->${archive}`,
        source: archiveSource,
        sourceHandle: "out",
        target: archive,
      },
      {
        id: `${wake}:out->${restoreSource}`,
        source: wake,
        sourceHandle: "out",
        target: restoreSource,
      },
      {
        id: `${restoreSource}:out->${restore}`,
        source: restoreSource,
        sourceHandle: "out",
        target: restore,
      },
    ],
  };
}

export interface SnoozeResult {
  ok: boolean;
  id?: string;
  wakeAt?: string;
  error?: string;
  invalid?: true;
}

async function archiveCheckpointed(runId: string, graph: WorkflowGraph): Promise<boolean> {
  const archive = graph.nodes.find((node) => node.kind === "action.archive");
  if (!archive) return false;
  const rows = await listNodeRuns(runId);
  return rows.some((row) => row.nodeId === archive.id && row.status === "completed");
}

export async function snoozeMessage(opts: {
  userId: string;
  workspaceId: string;
  linkId: string | null;
  target: SnoozeTarget;
  wakeAt: Date;
}): Promise<SnoozeResult> {
  if (Number.isNaN(opts.wakeAt.getTime())) {
    return {
      ok: false,
      invalid: true,
      error: "Pick a valid date and time to bring this back.",
    };
  }
  if (opts.wakeAt.getTime() <= Date.now()) {
    return {
      ok: false,
      invalid: true,
      error: "Pick a time that's still ahead of you.",
    };
  }

  const existing = await findLiveTarget({
    mailboxId: opts.target.mailboxId,
    kind: "snooze",
    targetKey: opts.target.messageId,
  });

  if (existing) {
    const loaded = await loadDefinition(existing.id);
    const graph = loaded?.graph;
    const archiveNode = graph?.nodes.find((n) => n.kind === "action.archive");
    const restoreNode = graph?.nodes.find((n) => n.kind === "action.restore");
    const unresolved =
      (archiveNode && (await nodeUnresolvedFor(existing.id, archiveNode.id))) ||
      (restoreNode && (await nodeUnresolvedFor(existing.id, restoreNode.id)));
    if (unresolved) {
      return {
        ok: false,
        error:
          "The previous snooze of this message has an unresolved outcome — check the message, then cancel it and snooze again",
      };
    }
    if (await hasInFlightRun(existing.id)) {
      return {
        ok: false,
        error: "That message is still being handled — try again in a moment",
      };
    }
    if (existing.enabled) {
      const moved = await rescheduleOnce({
        workflowId: existing.id,
        at: opts.wakeAt,
      });
      if (moved.cancelled) {
        return {
          ok: true,
          id: existing.id,
          wakeAt: opts.wakeAt.toISOString(),
        };
      }
      return {
        ok: false,
        error: moved.reason ?? "That snooze could not be rescheduled",
      };
    }
    await softDeleteDefinition(existing.id);
  }

  const saved = await saveDefinition({
    kind: "snooze",
    workspaceId: opts.workspaceId,
    principalUserId: opts.userId,
    mailboxId: opts.target.mailboxId,
    originLinkId: opts.linkId,
    name: "Snoozed message",
    targetKey: opts.target.messageId,
    enabled: false,
    graph: snoozeGraph(opts.target, opts.wakeAt),
  });

  const triggers = await listTriggers(saved.definition.id);
  const manual = triggers.find((t) => t.kind === "trigger.manual");
  if (!manual) {
    await softDeleteDefinition(saved.definition.id);
    return { ok: false, error: "Could not prepare the snooze" };
  }

  const runId = await requestManualRun({
    definition: saved.definition,
    revisionId: saved.revisionId,
    trigger: manual,
    requestedByUserId: opts.userId,
  });
  if (!runId) {
    await softDeleteDefinition(saved.definition.id);
    return { ok: false, error: "Could not prepare the snooze" };
  }

  const status = await runNow(runId);
  const settled = status !== "completed" && status !== "pending";
  if (settled && !(await archiveCheckpointed(runId, saved.graph))) {
    const archiveNode = saved.graph.nodes.find((n) => n.kind === "action.archive");
    if (archiveNode && (await nodeUnresolvedFor(saved.definition.id, archiveNode.id))) {
      return {
        ok: false,
        error:
          "The archive did not finish in time and its outcome is unknown — check the message before snoozing again",
      };
    }
    await softDeleteDefinition(saved.definition.id);
    return {
      ok: false,
      error: "Could not archive that message, so nothing was snoozed",
    };
  }

  return {
    ok: true,
    id: saved.definition.id,
    wakeAt: opts.wakeAt.toISOString(),
  };
}

export async function cancelSnooze(opts: {
  mailboxId: string;
  messageId: string;
}): Promise<CancelResult> {
  const existing = await findLiveTarget({
    mailboxId: opts.mailboxId,
    kind: "snooze",
    targetKey: opts.messageId,
  });
  if (!existing) return { cancelled: true };
  return cancelBuiltinWorkflow(existing.id);
}

function snoozedMessageId(graph: WorkflowGraph): string | undefined {
  const source = graph.nodes.find((node) => node.kind === "mailbox.source");
  return source?.kind === "mailbox.source" ? source.messageId : undefined;
}

export async function unsnoozeMessage(opts: {
  adapter: MailAdapter;
  id: string;
  target: { mailboxId: string; messageId: string };
}): Promise<CancelResult> {
  const live = await findLiveTarget({
    mailboxId: opts.target.mailboxId,
    kind: "snooze",
    targetKey: opts.target.messageId,
  });
  const loaded = live ? await loadDefinition(live.id) : null;
  const current = loaded ? snoozedMessageId(loaded.graph) : undefined;
  const restoreId =
    current && current !== opts.target.messageId
      ? opts.id === opts.target.messageId
        ? current
        : compositeId(opts.target.mailboxId, current)
      : opts.id;
  await opts.adapter.restoreMessage(restoreId);
  const result = await cancelSnooze(opts.target);
  if (result.cancelled) return result;
  return {
    cancelled: false,
    reason: result.reason ?? "The message is back in your inbox, but its wake-up is still running",
  };
}

export async function cancelSnoozeById(
  workflowId: string,
  mailboxIds: string[],
): Promise<CancelResult> {
  const loaded = await loadDefinition(workflowId);
  const gone = { cancelled: false, reason: "That snooze is gone" };
  if (!loaded) return gone;
  const { definition } = loaded;
  if (
    definition.kind !== "snooze" ||
    !definition.mailboxId ||
    !mailboxIds.includes(definition.mailboxId)
  ) {
    return gone;
  }
  return cancelBuiltinWorkflow(workflowId);
}

export interface SnoozedItem {
  id: string;
  mailboxId: string;
  messageId: string;
  currentMessageId: string;
  wakeAt: Date;
  status: RunStatus | "pending";
  error: string | null;
}

export async function listSnoozes(mailboxIds: string[]): Promise<SnoozedItem[]> {
  const rows = await listBuiltins({ kind: "snooze", mailboxIds });
  const items = await Promise.all(
    rows.map(async (row) => {
      const once = row.graph.nodes.find((n) => n.kind === "trigger.once");
      const planned = once && once.kind === "trigger.once" ? new Date(once.at) : new Date();
      const archive = row.graph.nodes.find((n) => n.kind === "action.archive");
      const unresolved =
        !row.definition.enabled &&
        !row.inFlight &&
        !!archive &&
        (await nodeUnresolvedFor(row.definition.id, archive.id));
      return {
        id: row.definition.id,
        mailboxId: row.definition.mailboxId ?? "",
        messageId: row.definition.targetKey ?? "",
        currentMessageId: snoozedMessageId(row.graph) ?? row.definition.targetKey ?? "",
        wakeAt: row.wakeAt ?? planned,
        status: !row.definition.enabled
          ? row.inFlight
            ? ("running" as const)
            : ("blocked" as const)
          : row.armed
            ? ("pending" as const)
            : (row.status ?? "pending"),
        error:
          row.definition.enabled || row.inFlight
            ? row.error
            : unresolved
              ? "The archive did not finish in time and its outcome is unknown — check the message before cancelling"
              : "The archive never completed — cancel this and snooze again",
      };
    }),
  );
  return items
    .filter((row) => row.messageId)
    .toSorted((a, b) => a.wakeAt.getTime() - b.wakeAt.getTime());
}

export async function listSnoozedEmails(
  mail: Pick<MailScope, "adapter" | "mailboxes" | "isAggregate">,
): Promise<SnoozedEmail[]> {
  const rows = await listSnoozes(mail.mailboxes.map((m) => m.mailboxId));
  const emails: SnoozedEmail[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const box = mail.mailboxes.find((m) => m.mailboxId === row.mailboxId);
      if (!box) return;
      const scoped = (messageId: string) =>
        mail.isAggregate ? compositeId(row.mailboxId, messageId) : messageId;
      const id = scoped(row.messageId);
      let meta: Partial<Email> = {};
      let metaError: string | null = null;
      try {
        meta = (await mail.adapter.getMessage(scoped(row.currentMessageId))) ?? {};
      } catch (err) {
        metaError = sanitizeError(err);
      }
      emails.push({
        id,
        threadId: meta.threadId,
        from: meta.from ?? "",
        fromName: meta.fromName,
        to: meta.to ?? [],
        cc: meta.cc,
        subject: meta.subject ?? (metaError ? "(message details unavailable)" : "(no subject)"),
        snippet: meta.snippet ?? metaError ?? "",
        date: meta.date ?? new Date().toISOString(),
        isRead: meta.isRead ?? true,
        isStarred: meta.isStarred ?? false,
        labels: meta.labels ?? [],
        provider: box.provider,
        folder: "inbox",
        scheduleId: row.id,
        wakeAt: row.wakeAt.toISOString(),
        status: row.status,
        error: row.error,
      });
    }),
  );

  return emails.toSorted((a, b) => a.wakeAt.localeCompare(b.wakeAt));
}
