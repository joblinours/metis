import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { Email } from "@/types/mail";

import { authorizeMailbox, resolvePrincipal } from "./authorization";
import { coalesceMissed, nextCronAt } from "./cron";
import { targetsOf } from "./graph";
import type { DiscoveredMessage, DiscoveryCursor, RunInput } from "./runtime";
import type { WorkflowGraph, WorkflowNode } from "./schema";
import {
  claimTrigger,
  type DefinitionRow,
  type DueTrigger,
  hasInFlightRun,
  nodeCompletedFor,
  openOccurrence,
  releaseTrigger,
  type TriggerRow,
  updateTrigger,
} from "./store";

const SCAN_PAGES = 3;
const SWEEP_EVERY_SCANS = 10;
const SWEEP_MAX_PAGES = 20;
const SCAN_PAGE_SIZE = 50;
const SEEN_LIMIT = 1_000;
const TRIGGER_CLAIM_MS = 120_000;

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("The tick ran out of budget"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export interface DiscoveryResult {
  created: number;
  error?: string;
}

function incomingMailboxNode(
  graph: WorkflowGraph,
  triggerNodeId: string,
): Extract<WorkflowNode, { kind: "mailbox.source" }> | null {
  for (const node of targetsOf(graph, triggerNodeId)) {
    if (node.kind === "mailbox.source" && node.operation === "incoming") {
      return node;
    }
  }
  return null;
}

function toDiscovered(mailboxId: string, email: Email): DiscoveredMessage {
  return {
    mailboxId,
    messageId: email.id,
    threadId: email.threadId,
    from: email.from,
    fromName: email.fromName,
    to: email.to ?? [],
    cc: email.cc,
    subject: email.subject ?? "",
    snippet: email.snippet ?? "",
    date: email.date,
  };
}

async function discoverSchedule(due: DueTrigger, now: Date): Promise<DiscoveryResult> {
  const { trigger, definition } = due;
  if (!trigger.cron || !trigger.nextDueAt) {
    await updateTrigger(trigger.id, { armed: false, nextDueAt: null });
    return { created: 0 };
  }

  const coalesced = coalesceMissed(trigger.cron, trigger.timezone, trigger.nextDueAt, now);
  const input: RunInput = {
    kind: "schedule",
    triggerNodeId: trigger.nodeId,
    firedFor: coalesced.firedFor.toISOString(),
    missed: coalesced.missed,
  };

  const runId = await openOccurrence({
    workflowId: definition.id,
    triggerId: trigger.id,
    revisionId: trigger.revisionId,
    key: coalesced.firedFor.toISOString(),
    scheduledFor: coalesced.firedFor,
    kind: definition.kind,
    workspaceId: definition.workspaceId,
    principalUserId: definition.principalUserId,
    input,
    dueAt: now,
    triggerPatch: {
      nextDueAt: coalesced.next ?? nextCronAt(trigger.cron, trigger.timezone, now),
      lastRunAt: now,
      lastError: null,
    },
  });

  return { created: runId ? 1 : 0 };
}

async function discoverOnce(due: DueTrigger, now: Date): Promise<DiscoveryResult> {
  const { trigger, definition, graph } = due;
  if (await hasInFlightRun(definition.id)) return { created: 0 };
  if (definition.kind === "snooze") {
    const archive = graph.nodes.find((n) => n.kind === "action.archive");
    if (!archive || !(await nodeCompletedFor(definition.id, archive.id))) {
      return { created: 0 };
    }
  }
  const firedFor = trigger.nextDueAt ?? now;
  const input: RunInput = {
    kind: "once",
    triggerNodeId: trigger.nodeId,
    firedFor: firedFor.toISOString(),
  };

  const runId = await openOccurrence({
    workflowId: definition.id,
    triggerId: trigger.id,
    revisionId: trigger.revisionId,
    key: `once:${firedFor.toISOString()}`,
    scheduledFor: firedFor,
    kind: definition.kind,
    workspaceId: definition.workspaceId,
    principalUserId: definition.principalUserId,
    input,
    dueAt: now,
    triggerPatch: { armed: false, nextDueAt: null, lastRunAt: now },
  });

  return { created: runId ? 1 : 0 };
}

async function discoverNewMail(
  due: DueTrigger,
  now: Date,
  cadenceSec: number,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const { trigger, definition, graph } = due;
  const node = incomingMailboxNode(graph, trigger.nodeId);
  if (!node) {
    await updateTrigger(trigger.id, {
      nextDueAt: new Date(now.getTime() + cadenceSec * 1000),
      lastError: "This trigger is not connected to a mailbox",
    });
    return { created: 0, error: "trigger has no mailbox" };
  }

  const principal = await resolvePrincipal(definition);
  if (!principal.ok) {
    await updateTrigger(trigger.id, {
      nextDueAt: new Date(now.getTime() + cadenceSec * 1000),
      lastError: principal.reason,
    });
    return { created: 0, error: principal.reason };
  }

  const authorized = await authorizeMailbox({
    definition,
    principal: principal.value,
    mailboxId: node.mailboxId,
  });
  if (!authorized.ok) {
    await updateTrigger(trigger.id, {
      nextDueAt: new Date(now.getTime() + cadenceSec * 1000),
      lastError: authorized.reason,
    });
    return { created: 0, error: authorized.reason };
  }

  const token = crypto.randomUUID();
  const claimed = await claimTrigger(trigger.id, token, now, TRIGGER_CLAIM_MS);
  if (!claimed) return { created: 0 };

  const cursor: DiscoveryCursor =
    trigger.cursor?.mailboxId === node.mailboxId && trigger.cursor.folder === node.folder
      ? trigger.cursor
      : {
          mailboxId: node.mailboxId,
          folder: node.folder,
          seen: [],
          baselined: false,
          scans: 0,
          updatedAt: now.toISOString(),
        };
  const baselining = !cursor.baselined;
  const sweeping =
    baselining || cursor.sweepPages !== undefined || cursor.scans % SWEEP_EVERY_SCANS === 0;
  const seen = new Set(cursor.seen);
  const committed: string[] = [];
  let created = 0;
  let error: string | undefined;
  let progress = { token: cursor.pageToken, pages: cursor.sweepPages ?? 0 };
  let exhausted = false;
  let idle = false;

  try {
    for (let page = 0; page < SCAN_PAGES; page += 1) {
      if (signal?.aborted) throw new Error("The tick ran out of budget");
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
      const listed = await withAbort(
        authorized.value.adapter.listMessages(node.folder, progress.token, SCAN_PAGE_SIZE),
        signal,
      );
      const emails = listed.emails ?? [];
      let unseenOnPage = 0;

      for (const email of emails) {
        if (!email.id || seen.has(email.id)) continue;
        unseenOnPage += 1;

        const at = email.date ? new Date(email.date) : null;
        // oxlint-disable-next-line eslint/no-await-in-loop -- occurrences open in listing order so the committed cursor only ever covers opened mail
        const runId = await openOccurrence({
          workflowId: definition.id,
          triggerId: trigger.id,
          revisionId: trigger.revisionId,
          key: `mail:${node.mailboxId}:${email.id}`,
          scheduledFor: at && !Number.isNaN(at.getTime()) ? at : now,
          kind: definition.kind,
          workspaceId: definition.workspaceId,
          principalUserId: definition.principalUserId,
          input: {
            kind: "newMail",
            triggerNodeId: trigger.nodeId,
            messages: [toDiscovered(node.mailboxId, email)],
          },
          dueAt: now,
          withoutRun: baselining,
        });
        if (runId) created += 1;

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
      if (!sweeping && unseenOnPage === 0) {
        idle = true;
        break;
      }
    }
  } catch (err) {
    error = sanitizeError(err);
    if (progress.token === cursor.pageToken && cursor.pageToken) {
      progress = { token: undefined, pages: 0 };
    }
  }

  const finished = exhausted || idle;
  const kept = [...cursor.seen, ...committed].slice(-SEEN_LIMIT);
  const written = await updateTrigger(
    trigger.id,
    {
      nextDueAt: new Date(now.getTime() + cadenceSec * 1000),
      cursor: {
        mailboxId: node.mailboxId,
        folder: node.folder,
        pageToken: finished ? undefined : progress.token,
        seen: kept,
        baselined: cursor.baselined || (baselining && exhausted),
        sweepPages: sweeping && !finished ? progress.pages : undefined,
        scans: finished ? cursor.scans + 1 : cursor.scans,
        updatedAt: now.toISOString(),
      },
      lastRunAt: now,
      lastError: error ?? null,
    },
    token,
  );
  if (!written) return { created, error: error ?? "discovery claim was lost" };
  await releaseTrigger(trigger.id, token);

  return { created, error };
}

export async function discoverTrigger(
  due: DueTrigger,
  now: Date,
  cadenceSec: number,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  switch (due.trigger.kind) {
    case "trigger.schedule":
      return discoverSchedule(due, now);
    case "trigger.once":
      return discoverOnce(due, now);
    case "trigger.newMail":
      return discoverNewMail(due, now, cadenceSec, signal);
    default:
      await updateTrigger(due.trigger.id, { armed: false, nextDueAt: null });
      return { created: 0 };
  }
}

export async function requestManualRun(opts: {
  definition: DefinitionRow;
  revisionId: string;
  trigger: TriggerRow;
  requestedByUserId: string;
  messages?: { mailboxId: string; messageId: string }[];
}): Promise<string | null> {
  const now = new Date();
  return openOccurrence({
    workflowId: opts.definition.id,
    triggerId: opts.trigger.id,
    revisionId: opts.revisionId,
    key: `manual:${crypto.randomUUID()}`,
    scheduledFor: now,
    kind: opts.definition.kind,
    workspaceId: opts.definition.workspaceId,
    principalUserId: opts.definition.principalUserId,
    input: {
      kind: "manual",
      triggerNodeId: opts.trigger.nodeId,
      requestedByUserId: opts.requestedByUserId,
      messages: opts.messages,
    },
    dueAt: now,
  });
}
