import "server-only";
import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import type { ResolvedMailbox } from "@/mail/aggregate";
import { forSender, type MailScope } from "@/mail/session";
import type { ScheduledSendItem as ScheduledSendView } from "@/server/schema";
import { enforceRateLimit } from "@/services/rate-limit";
import type { DraftPayload } from "@/types/mail";

import { newNodeId } from "../graph";
import {
  findUnconfirmedSend,
  resolveUnconfirmedSend,
  type SendDecision,
  type SendResolution,
  type SentCandidate,
  sentCandidates,
  type UnconfirmedSend,
} from "../reconcile";
import { type RunResume, resumeCheckedRun } from "../resume";
import type { NodeResolution } from "../runtime";
import type { RunStatus, WorkflowGraph } from "../schema";
import {
  type CancelResult,
  cancelBuiltinWorkflow,
  type DefinitionRow,
  getPayload,
  latestRunId,
  listBuiltins,
  listSendNodeRuns,
  loadDefinition,
  putPayload,
  saveDefinition,
  setDefinitionEnabled,
} from "../store";
import { prepareOutgoing } from "./before-send";

function sendGraph(opts: { mailboxId: string; at: Date }): WorkflowGraph {
  const trigger = newNodeId();
  const source = newNodeId();
  const send = newNodeId();
  const tag = newNodeId();

  return {
    nodes: [
      {
        id: trigger,
        kind: "trigger.once",
        position: { x: 0, y: 0 },
        at: opts.at.toISOString(),
      },
      {
        id: source,
        kind: "mailbox.source",
        position: { x: 0, y: 170 },
        mailboxId: opts.mailboxId,
        operation: "draft",
        folder: "drafts",
        limit: 1,
      },
      { id: send, kind: "action.send", position: { x: 0, y: 340 } },
      {
        id: tag,
        kind: "action.label",
        position: { x: 0, y: 510 },
        label: "scheduled",
      },
    ],
    edges: [
      {
        id: `${trigger}:out->${source}`,
        source: trigger,
        sourceHandle: "out",
        target: source,
      },
      {
        id: `${source}:out->${send}`,
        source: source,
        sourceHandle: "out",
        target: send,
      },
      {
        id: `${send}:out->${tag}`,
        source: send,
        sourceHandle: "out",
        target: tag,
      },
    ],
  };
}

export async function scheduleSend(opts: {
  userId: string;
  workspaceId: string;
  mailboxId: string;
  linkId: string | null;
  payload: DraftPayload;
  at: Date;
}): Promise<{ id: string; scheduledFor: string }> {
  const prepared = await prepareOutgoing({
    workspaceId: opts.workspaceId,
    mailboxId: opts.mailboxId,
    payload: opts.payload,
  });

  const saved = await saveDefinition({
    kind: "scheduled-send",
    workspaceId: opts.workspaceId,
    principalUserId: opts.userId,
    mailboxId: opts.mailboxId,
    originLinkId: opts.linkId,
    name: prepared.subject || "Scheduled message",
    enabled: false,
    graph: sendGraph({ mailboxId: opts.mailboxId, at: opts.at }),
  });

  await putPayload(saved.definition.id, prepared);
  await setDefinitionEnabled(saved.definition.id, true);

  return { id: saved.definition.id, scheduledFor: opts.at.toISOString() };
}

export async function scheduleOutgoing(opts: {
  mail: Pick<MailScope, "userId" | "workspaceId" | "mailboxes" | "isAggregate">;
  from: ResolvedMailbox;
  payload: DraftPayload;
  scheduledFor: string;
}): Promise<{ id: string; scheduledFor: string } | { error: string }> {
  await enforceRateLimit(opts.mail.userId, {
    scope: "schedule-send",
    limit: 30,
    windowSec: 60,
  });

  const when = new Date(opts.scheduledFor);
  if (Number.isNaN(when.getTime())) {
    return { error: "Pick a valid date and time to send this." };
  }
  if (when.getTime() <= Date.now()) {
    return { error: "Pick a time that's still ahead of you." };
  }

  const scheduled = await scheduleSend({
    userId: opts.mail.userId,
    workspaceId: opts.mail.workspaceId,
    mailboxId: opts.from.mailboxId,
    linkId: opts.from.linkId,
    payload: forSender(opts.mail, opts.from, opts.payload),
    at: when,
  });

  console.log(
    `[workflow/scheduled-send] queued ${scheduled.id} for ${scheduled.scheduledFor} — the workflow tick fires it, nothing is sent now`,
  );

  return scheduled;
}

export async function cancelScheduledSend(
  workflowId: string,
  mailboxIds: string[],
): Promise<CancelResult> {
  const loaded = await loadDefinition(workflowId);
  const gone = { cancelled: false, reason: "That scheduled message is gone" };
  if (!loaded) return gone;
  const { definition } = loaded;
  if (
    definition.kind !== "scheduled-send" ||
    !definition.mailboxId ||
    !mailboxIds.includes(definition.mailboxId)
  ) {
    return gone;
  }
  return cancelBuiltinWorkflow(workflowId);
}

export async function retryScheduledSend(
  workflowId: string,
  mailboxIds: string[],
): Promise<RunResume | null> {
  const loaded = await loadDefinition(workflowId);
  if (
    loaded?.definition.kind !== "scheduled-send" ||
    !loaded.definition.mailboxId ||
    !mailboxIds.includes(loaded.definition.mailboxId)
  ) {
    return null;
  }
  const runId = await latestRunId(workflowId);
  if (!runId) return null;
  return resumeCheckedRun(runId);
}

async function scopedSend(
  workflowId: string,
  mailboxIds: string[],
  nodeRunId?: string,
): Promise<UnconfirmedSend | "none" | null> {
  const loaded = await loadDefinition(workflowId);
  if (
    loaded?.definition.kind !== "scheduled-send" ||
    loaded.definition.deletedAt ||
    !loaded.definition.mailboxId ||
    !mailboxIds.includes(loaded.definition.mailboxId)
  ) {
    return null;
  }
  const send = await findUnconfirmedSend(workflowId, nodeRunId);
  if (!send || !mailboxIds.includes(send.mailboxId)) return "none";
  return send;
}

export type UnconfirmedSendView =
  | { state: "none" }
  | {
      state: "unconfirmed";
      nodeRunId: string;
      settled: boolean;
      dispatchedAt: Date | null;
      error: string | null;
      candidates: SentCandidate[];
      lookupError: string | null;
      notice: string | null;
    };

export async function inspectUnconfirmedSend(
  workflowId: string,
  mailboxIds: string[],
): Promise<UnconfirmedSendView | null> {
  const send = await scopedSend(workflowId, mailboxIds);
  if (!send) return null;
  if (send === "none") return { state: "none" };
  const found = send.settled
    ? await sentCandidates(send)
    : { ok: true as const, candidates: [], notice: null };
  return {
    state: "unconfirmed",
    nodeRunId: send.nodeRun.id,
    settled: send.settled,
    dispatchedAt: send.nodeRun.startedAt,
    error: send.nodeRun.error,
    candidates: found.ok ? found.candidates : [],
    lookupError: found.ok ? null : found.reason,
    notice: found.ok ? found.notice : null,
  };
}

export async function resolveScheduledSend(opts: {
  workflowId: string;
  mailboxIds: string[];
  nodeRunId: string;
  userId: string;
  decision: SendDecision;
}): Promise<SendResolution | null> {
  const send = await scopedSend(opts.workflowId, opts.mailboxIds, opts.nodeRunId);
  if (!send || send === "none") return null;
  return resolveUnconfirmedSend({
    send,
    userId: opts.userId,
    decision: opts.decision,
  });
}

export interface ScheduledSendResolution {
  outcome: NodeResolution["outcome"];
  reason: NodeResolution["reason"];
  note: string | null;
  resolvedAt: Date;
  resolvedByUserId: string | null;
}

export interface ScheduledSendItem {
  id: string;
  mailboxId: string;
  scheduledFor: Date;
  status: RunStatus | "pending";
  sent: boolean;
  unconfirmed: boolean;
  resolution: ScheduledSendResolution | null;
  error: string | null;
  payload: DraftPayload | null;
  scheduledByUserId: string | null;
  definition: DefinitionRow;
}

export async function listScheduledSends(mailboxIds: string[]): Promise<ScheduledSendItem[]> {
  const rows = await listBuiltins({ kind: "scheduled-send", mailboxIds });
  const sends = await listSendNodeRuns({
    workflowIds: rows.map((row) => row.definition.id),
    nodeIds: rows.flatMap((row) =>
      row.graph.nodes.filter((node) => node.kind === "action.send").map((node) => node.id),
    ),
  });
  const outcome = (workflowId: string) => {
    const own = sends.filter((send) => send.workflowId === workflowId);
    const resolved = own.find((send) => send.nodeRun.resolvedAt);
    const resolution: ScheduledSendResolution | null =
      resolved?.nodeRun.resolution && resolved.nodeRun.resolvedAt
        ? {
            outcome: resolved.nodeRun.resolution.outcome,
            reason: resolved.nodeRun.resolution.reason,
            note: resolved.nodeRun.resolution.note,
            resolvedAt: resolved.nodeRun.resolvedAt,
            resolvedByUserId: resolved.nodeRun.resolvedByUserId,
          }
        : null;
    return {
      unconfirmed: own.some(
        (send) =>
          send.runSettled &&
          !send.nodeRun.resolvedAt &&
          (send.nodeRun.status === "dispatching" || send.nodeRun.status === "unknown"),
      ),
      resolution,
    };
  };

  const items = await Promise.all(
    rows.map(async (row) => {
      const at = row.graph.nodes.find((n) => n.kind === "trigger.once");
      const scheduledFor =
        row.wakeAt ?? (at && at.kind === "trigger.once" ? new Date(at.at) : new Date());
      return {
        id: row.definition.id,
        mailboxId: row.definition.mailboxId ?? "",
        scheduledFor,
        status: !row.definition.enabled
          ? ("blocked" as const)
          : row.armed
            ? ("pending" as const)
            : (row.status ?? "pending"),
        error: row.definition.enabled
          ? row.error
          : "This message was never armed — cancel it and schedule again",
        sent: row.sent,
        ...outcome(row.definition.id),
        payload: await getPayload(row.definition.id),
        scheduledByUserId: row.definition.principalUserId,
        definition: row.definition,
      };
    }),
  );

  return items.toSorted((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

export async function listScheduledMail(
  mailboxIds: string[],
  viewerUserId: string,
): Promise<ScheduledSendView[]> {
  const items = await listScheduledSends(mailboxIds);
  if (items.length === 0) return [];

  const userIds = [
    ...new Set(
      items
        .flatMap((item) => [item.scheduledByUserId, item.resolution?.resolvedByUserId])
        .filter((id): id is string => !!id),
    ),
  ];
  const owners =
    userIds.length === 0
      ? []
      : await db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, userIds));
  const names = new Map(owners.map((row) => [row.id, row.name]));

  return items.map((item) => ({
    id: item.id,
    scheduledFor: item.scheduledFor,
    status: item.status,
    sent: item.sent,
    unconfirmed: item.unconfirmed,
    resolution: item.resolution
      ? {
          outcome: item.resolution.outcome,
          reason: item.resolution.reason,
          note: item.resolution.note,
          resolvedAt: item.resolution.resolvedAt,
          resolvedByName: item.resolution.resolvedByUserId
            ? (names.get(item.resolution.resolvedByUserId) ?? "Someone")
            : "Someone",
        }
      : null,
    subject: item.payload?.subject ?? item.definition.name,
    error: item.error,
    payload: item.payload,
    scheduledByName: item.scheduledByUserId
      ? (names.get(item.scheduledByUserId) ?? "Someone")
      : "Someone",
    scheduledByMe: item.scheduledByUserId === viewerUserId,
  }));
}
