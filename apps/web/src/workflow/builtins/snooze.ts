import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { MailAdapter } from "@/mail/adapter";
import { compositeId } from "@/mail/aggregate";
import type { MailScope } from "@/mail/session";
import type { SnoozedEmail } from "@/server/schema";
import type { Email } from "@/types/mail";

import { requestManualRun } from "../discovery";
import { expr, literal } from "../expr";
import { newNodeId } from "../graph";
import { GRAPH_VERSION, type RunStatus, type WorkflowGraph } from "../schema";
import {
  type CancelResult,
  cancelBuiltinWorkflow,
  cancelRun,
  findLiveTarget,
  hasInFlightRun,
  latestRun,
  listBuiltins,
  listStepRuns,
  listTriggers,
  loadDefinition,
  rescheduleWait,
  saveDefinition,
  softDeleteDefinition,
  stepUnresolvedFor,
} from "../store";
import { runNow } from "../tick";

interface SnoozeTarget {
  mailboxId: string;
  messageId: string;
  threadId?: string;
}

const ARCHIVE = "archive";
const WAIT = "wait";
const RETURN = "return";

export type SnoozeReturn = "inbox" | "archive" | "trash";

export function snoozeReturn(folder: string | undefined): SnoozeReturn {
  return folder === "archive" || folder === "trash" ? folder : "inbox";
}

const RETURN_STEPS: Record<SnoozeReturn, string | null> = {
  inbox: "mail.toInbox",
  trash: "mail.trash",
  archive: null,
};

function snoozeGraph(folder: SnoozeReturn): WorkflowGraph {
  const trigger = newNodeId();
  const back = RETURN_STEPS[folder];
  return {
    version: GRAPH_VERSION,
    nodes: [
      {
        id: trigger,
        step: "trigger.manual",
        position: { x: 0, y: 0 },
        params: {
          inputs: literal([
            { name: "message", type: "mail" },
            { name: "folder", type: "text" },
            { name: "wakeAt", type: "date" },
          ]),
        },
      },
      {
        id: ARCHIVE,
        step: "mail.archive",
        position: { x: 352, y: 0 },
        params: { message: expr("trigger.inputs.message") },
      },
      {
        id: WAIT,
        step: "flow.waitUntil",
        position: { x: 704, y: 0 },
        params: { at: expr("trigger.inputs.wakeAt") },
      },
      ...(back
        ? [
            {
              id: RETURN,
              step: back,
              position: { x: 1056, y: 0 },
              params: { message: expr("item") },
            },
          ]
        : []),
    ],
    edges: [
      { id: `${trigger}:out->${ARCHIVE}`, source: trigger, sourceHandle: "out", target: ARCHIVE },
      { id: `${ARCHIVE}:out->${WAIT}`, source: ARCHIVE, sourceHandle: "out", target: WAIT },
      ...(back
        ? [{ id: `${WAIT}:out->${RETURN}`, source: WAIT, sourceHandle: "out", target: RETURN }]
        : []),
    ],
    settings: {},
  };
}

export interface SnoozeResult {
  ok: boolean;
  id?: string;
  wakeAt?: string;
  error?: string;
  invalid?: true;
}

function snoozedFrom(event: unknown): SnoozeReturn {
  if (!event || typeof event !== "object" || !("inputs" in event)) return "inbox";
  const inputs = event.inputs;
  if (!inputs || typeof inputs !== "object" || !("folder" in inputs)) return "inbox";
  return snoozeReturn(typeof inputs.folder === "string" ? inputs.folder : undefined);
}

async function archivedId(runId: string): Promise<string | null> {
  const rows = await listStepRuns(runId);
  const archived = rows.find((row) => row.nodeId === ARCHIVE && row.status === "completed");
  const value = archived?.output?.emits?.[0]?.value;
  if (!value || typeof value !== "object" || !("id" in value)) return null;
  return typeof value.id === "string" ? value.id : null;
}

export async function snoozeMessage(opts: {
  userId: string;
  workspaceId: string;
  linkId: string | null;
  target: SnoozeTarget;
  folder?: string;
  wakeAt: Date;
}): Promise<SnoozeResult> {
  if (Number.isNaN(opts.wakeAt.getTime())) {
    return { ok: false, invalid: true, error: "Pick a valid date and time to bring this back." };
  }
  if (opts.wakeAt.getTime() <= Date.now()) {
    return { ok: false, invalid: true, error: "Pick a time that's still ahead of you." };
  }

  const existing = await findLiveTarget({
    mailboxId: opts.target.mailboxId,
    kind: "snooze",
    targetKey: opts.target.messageId,
  });
  if (existing) {
    if (await stepUnresolvedFor(existing.id, ARCHIVE)) {
      return {
        ok: false,
        error:
          "The previous snooze of this message has an unresolved outcome — check the message, then cancel it and snooze again",
      };
    }
    const run = await latestRun(existing.id);
    if (run?.status === "waiting" && (await rescheduleWait({ runId: run.id, at: opts.wakeAt }))) {
      return { ok: true, id: existing.id, wakeAt: opts.wakeAt.toISOString() };
    }
    if (await hasInFlightRun(existing.id)) {
      return { ok: false, error: "That message is still being handled — try again in a moment" };
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
    enabled: true,
    graph: snoozeGraph(snoozeReturn(opts.folder)),
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
    graph: saved.graph,
    requestedByUserId: opts.userId,
    requestedBy: { email: "", name: "" },
    inputs: {
      message: {
        id: opts.target.messageId,
        mailboxId: opts.target.mailboxId,
        threadId: opts.target.threadId ?? "",
      },
      folder: snoozeReturn(opts.folder),
      wakeAt: opts.wakeAt.toISOString(),
    },
  });
  if (!runId) {
    await softDeleteDefinition(saved.definition.id);
    return { ok: false, error: "Could not prepare the snooze" };
  }

  const status = await runNow(runId);
  if (status !== "waiting" && status !== "pending" && !(await archivedId(runId))) {
    if (await stepUnresolvedFor(saved.definition.id, ARCHIVE)) {
      return {
        ok: false,
        error:
          "The archive did not finish in time and its outcome is unknown — check the message before snoozing again",
      };
    }
    await softDeleteDefinition(saved.definition.id);
    return { ok: false, error: "Could not archive that message, so nothing was snoozed" };
  }

  return { ok: true, id: saved.definition.id, wakeAt: opts.wakeAt.toISOString() };
}

async function cancelSnoozeWorkflow(workflowId: string): Promise<CancelResult> {
  const run = await latestRun(workflowId);
  if (run && (run.status === "waiting" || run.status === "pending")) {
    const cancelled = await cancelRun(run.id);
    if (cancelled.state === "stopping") {
      return { cancelled: false, reason: "That is still being handled — try again in a moment" };
    }
  }
  if (await stepUnresolvedFor(workflowId, ARCHIVE)) {
    return {
      cancelled: false,
      reason: "A step of this item has an unresolved outcome — check the message before cancelling",
    };
  }
  const deleted = await softDeleteDefinition(workflowId);
  return deleted ? { cancelled: true } : cancelBuiltinWorkflow(workflowId);
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
  return cancelSnoozeWorkflow(existing.id);
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
  const run = live ? await latestRun(live.id) : null;
  const current = run ? await archivedId(run.id) : null;
  const restoreId =
    current && current !== opts.target.messageId
      ? opts.id === opts.target.messageId
        ? current
        : compositeId(opts.target.mailboxId, current)
      : opts.id;
  const folder = run ? snoozedFrom(run.input.event) : "inbox";
  if (folder === "inbox") await opts.adapter.restoreMessage(restoreId);
  else if (folder === "trash") await opts.adapter.deleteMessage(restoreId);
  const result = await cancelSnooze(opts.target);
  if (result.cancelled) return result;
  return {
    cancelled: false,
    reason: result.reason ?? "The message is back, but its wake-up is still running",
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
  return cancelSnoozeWorkflow(workflowId);
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
      const run = row.run;
      const current = run ? await archivedId(run.id) : null;
      const status: RunStatus | "pending" = !run
        ? "pending"
        : run.status === "waiting"
          ? "pending"
          : run.status;
      return {
        id: row.definition.id,
        mailboxId: row.definition.mailboxId ?? "",
        messageId: row.definition.targetKey ?? "",
        currentMessageId: current ?? row.definition.targetKey ?? "",
        wakeAt: row.waitAt ?? run?.dueAt ?? new Date(),
        status,
        error:
          run?.status === "failed" || run?.status === "blocked" || run?.status === "partial"
            ? (run.error ?? "The snooze did not finish — cancel it and snooze again")
            : null,
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
