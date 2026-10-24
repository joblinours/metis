import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, type Executor } from "@/db";
import {
  user,
  workflow,
  workflowNodeRun,
  workflowOccurrence,
  workflowPayload,
  workflowResource,
  workflowRevision,
  workflowRun,
  workflowTick,
  workflowTrigger,
  workspaceMember,
} from "@/db/schema";
import { keysOf } from "@/lib/guards";
import { recordOf } from "@/lib/records";
import type { DraftPayload } from "@/types/mail";

import { nextCronAt } from "./cron";
import { isDispatchNode } from "./nodes";
import type {
  DiscoveryCursor,
  Envelope,
  NodeReceipt,
  NodeResolution,
  NodeRunOutput,
  RunInput,
  RunSummaryLine,
} from "./runtime";
import {
  BARRIER_INPUT_KEY,
  isTriggerKind,
  type NodeStatus,
  type RunStatus,
  type TriggerKind,
  type WorkflowGraph,
  type WorkflowKind,
} from "./schema";

export type DefinitionRow = typeof workflow.$inferSelect;
export type TriggerRow = typeof workflowTrigger.$inferSelect;
export type RunRow = typeof workflowRun.$inferSelect;
export type NodeRunRow = typeof workflowNodeRun.$inferSelect;

export const TICK_ID = "singleton";

export interface LoadedDefinition {
  definition: DefinitionRow;
  revisionId: string;
  graph: WorkflowGraph;
}

export interface SaveDefinitionInput {
  id?: string;
  kind: WorkflowKind;
  workspaceId?: string | null;
  principalUserId?: string | null;
  mailboxId?: string | null;
  originLinkId?: string | null;
  name: string;
  targetKey?: string | null;
  enabled: boolean;
  graph: WorkflowGraph;
  sortOrder?: number;
  resourceLinks?: Record<string, string | null>;
}

function triggerSeed(
  node: WorkflowGraph["nodes"][number],
  now: Date,
): {
  nextDueAt: Date | null;
  baselineAt: Date | null;
  cron: string | null;
  timezone: string;
} {
  if (node.kind === "trigger.schedule") {
    return {
      cron: node.cron,
      timezone: node.timezone,
      nextDueAt: nextCronAt(node.cron, node.timezone, now),
      baselineAt: null,
    };
  }
  if (node.kind === "trigger.once") {
    return {
      cron: null,
      timezone: "Etc/UTC",
      nextDueAt: new Date(node.at),
      baselineAt: null,
    };
  }
  if (node.kind === "trigger.newMail") {
    return { cron: null, timezone: "Etc/UTC", nextDueAt: now, baselineAt: now };
  }
  return { cron: null, timezone: "Etc/UTC", nextDueAt: null, baselineAt: null };
}

async function writeRevision(
  tx: Executor,
  opts: {
    workflowId: string;
    revision: number;
    graph: WorkflowGraph;
    resourceLinks: Record<string, string | null>;
    now: Date;
  },
): Promise<string> {
  const revisionId = crypto.randomUUID();
  await tx.insert(workflowRevision).values({
    id: revisionId,
    workflowId: opts.workflowId,
    revision: opts.revision,
    graph: opts.graph,
    createdAt: opts.now,
  });

  const resourceRows = opts.graph.nodes.flatMap((node) => {
    const mailboxId =
      node.kind === "mailbox.source"
        ? node.mailboxId
        : node.kind === "trigger.beforeSend"
          ? node.mailboxId
          : null;
    if (!mailboxId) return [];
    return [
      {
        id: crypto.randomUUID(),
        workflowId: opts.workflowId,
        revisionId,
        nodeId: node.id,
        mailboxId,
        mailboxWorkspaceId: opts.resourceLinks[node.id] ?? null,
      },
    ];
  });
  if (resourceRows.length > 0) {
    await tx.insert(workflowResource).values(resourceRows);
  }

  const existing = await tx
    .select()
    .from(workflowTrigger)
    .where(eq(workflowTrigger.workflowId, opts.workflowId));
  const byNode = new Map(existing.map((row) => [row.nodeId, row]));
  const keep = new Set<string>();

  /* oxlint-disable eslint/no-await-in-loop -- per-trigger updates share the transaction's single connection, which runs statements one at a time */
  for (const node of opts.graph.nodes) {
    if (!isTriggerKind(node.kind)) continue;
    keep.add(node.id);
    const seed = triggerSeed(node, opts.now);
    const prior = byNode.get(node.id);
    if (prior && prior.kind === node.kind) {
      const scheduleChanged =
        node.kind === "trigger.schedule" &&
        (prior.cron !== seed.cron || prior.timezone !== seed.timezone);
      await tx
        .update(workflowTrigger)
        .set({
          revisionId,
          cron: seed.cron,
          timezone: seed.timezone,
          armed: true,
          nextDueAt:
            scheduleChanged || node.kind === "trigger.once"
              ? seed.nextDueAt
              : prior.armed
                ? prior.nextDueAt
                : seed.nextDueAt,
          baselineAt:
            node.kind === "trigger.newMail" && !prior.armed ? seed.baselineAt : prior.baselineAt,
          cursor: node.kind === "trigger.newMail" && !prior.armed ? null : prior.cursor,
          lastError: node.kind === "trigger.newMail" && !prior.armed ? null : prior.lastError,
          updatedAt: opts.now,
        })
        .where(eq(workflowTrigger.id, prior.id));
      continue;
    }
    if (prior) {
      await tx
        .update(workflowTrigger)
        .set({
          revisionId,
          kind: node.kind,
          cron: seed.cron,
          timezone: seed.timezone,
          armed: true,
          nextDueAt: seed.nextDueAt,
          baselineAt: seed.baselineAt,
          cursor: null,
          lastError: null,
          updatedAt: opts.now,
        })
        .where(eq(workflowTrigger.id, prior.id));
      continue;
    }
    await tx.insert(workflowTrigger).values({
      id: crypto.randomUUID(),
      workflowId: opts.workflowId,
      revisionId,
      nodeId: node.id,
      kind: node.kind,
      cron: seed.cron,
      timezone: seed.timezone,
      armed: true,
      nextDueAt: seed.nextDueAt,
      baselineAt: seed.baselineAt,
      cursor: null,
      createdAt: opts.now,
      updatedAt: opts.now,
    });
  }
  /* oxlint-enable eslint/no-await-in-loop */

  const stale = existing.filter((row) => !keep.has(row.nodeId));
  if (stale.length > 0) {
    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: opts.now })
      .where(
        inArray(
          workflowTrigger.id,
          stale.map((row) => row.id),
        ),
      );
  }

  return revisionId;
}

async function cancelPendingRuns(tx: Executor, workflowId: string, now: Date): Promise<void> {
  const cancelled = await tx
    .update(workflowRun)
    .set({ status: "cancelled", finishedAt: now })
    .where(and(eq(workflowRun.workflowId, workflowId), eq(workflowRun.status, "pending")))
    .returning({ id: workflowRun.id });
  if (cancelled.length === 0) return;
  await tx
    .update(workflowNodeRun)
    .set({ output: null })
    .where(
      inArray(
        workflowNodeRun.runId,
        cancelled.map((row) => row.id),
      ),
    );
}

async function rearmTriggers(tx: Executor, workflowId: string, now: Date): Promise<void> {
  const triggers = await tx
    .select()
    .from(workflowTrigger)
    .where(and(eq(workflowTrigger.workflowId, workflowId), eq(workflowTrigger.armed, true)));
  for (const trigger of triggers) {
    if (trigger.kind === "trigger.schedule" && trigger.cron) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each schedule gets its own next time; statements share the transaction's single connection
      await tx
        .update(workflowTrigger)
        .set({
          nextDueAt: nextCronAt(trigger.cron, trigger.timezone, now),
          updatedAt: now,
        })
        .where(eq(workflowTrigger.id, trigger.id));
    }
  }
  const newMail = triggers
    .filter((trigger) => trigger.kind === "trigger.newMail")
    .map((trigger) => trigger.id);
  if (newMail.length > 0) {
    await tx
      .update(workflowTrigger)
      .set({
        baselineAt: now,
        cursor: null,
        nextDueAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(inArray(workflowTrigger.id, newMail));
  }
}

export async function saveDefinition(input: SaveDefinitionInput): Promise<LoadedDefinition> {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();

  const revisionId = await db.transaction(async (tx) => {
    await tx.insert(workflow).values({
      id,
      kind: input.kind,
      workspaceId: input.workspaceId ?? null,
      principalUserId: input.principalUserId ?? null,
      mailboxId: input.mailboxId ?? null,
      originLinkId: input.originLinkId ?? null,
      name: input.name,
      targetKey: input.targetKey ?? null,
      enabled: input.enabled,
      revision: 1,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
    return writeRevision(tx, {
      workflowId: id,
      revision: 1,
      graph: input.graph,
      resourceLinks: input.resourceLinks ?? {},
      now,
    });
  });

  const [row] = await db.select().from(workflow).where(eq(workflow.id, id));
  if (!row) throw new Error("workflow disappeared after insert");
  return { definition: row, revisionId, graph: input.graph };
}

export async function reviseDefinition(opts: {
  workflowId: string;
  name: string;
  enabled: boolean;
  graph: WorkflowGraph;
  resourceLinks?: Record<string, string | null>;
}): Promise<LoadedDefinition | null> {
  const now = new Date();

  const revisionId = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(workflow).where(eq(workflow.id, opts.workflowId));
    if (!current || current.deletedAt) return null;

    const revision = current.revision + 1;
    const id = await writeRevision(tx, {
      workflowId: opts.workflowId,
      revision,
      graph: opts.graph,
      resourceLinks: opts.resourceLinks ?? {},
      now,
    });
    if (!current.enabled && opts.enabled) {
      await rearmTriggers(tx, opts.workflowId, now);
    } else if (!opts.enabled && current.kind === "user") {
      await cancelPendingRuns(tx, opts.workflowId, now);
    }
    await tx
      .update(workflow)
      .set({
        name: opts.name,
        enabled: opts.enabled,
        revision,
        updatedAt: now,
      })
      .where(eq(workflow.id, opts.workflowId));
    return id;
  });

  if (!revisionId) return null;
  const [row] = await db.select().from(workflow).where(eq(workflow.id, opts.workflowId));
  if (!row) return null;
  return { definition: row, revisionId, graph: opts.graph };
}

export async function loadDefinition(workflowId: string): Promise<LoadedDefinition | null> {
  const [row] = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(
      workflowRevision,
      and(
        eq(workflowRevision.workflowId, workflow.id),
        eq(workflowRevision.revision, workflow.revision),
      ),
    )
    .where(eq(workflow.id, workflowId))
    .limit(1);
  if (!row) return null;
  return {
    definition: row.definition,
    revisionId: row.revision.id,
    graph: row.revision.graph,
  };
}

export async function loadRevision(
  revisionId: string,
): Promise<{ definition: DefinitionRow; graph: WorkflowGraph } | null> {
  const [row] = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflowRevision)
    .innerJoin(workflow, eq(workflow.id, workflowRevision.workflowId))
    .where(eq(workflowRevision.id, revisionId))
    .limit(1);
  if (!row) return null;
  return { definition: row.definition, graph: row.revision.graph };
}

export async function listDefinitions(opts: {
  workspaceId?: string;
  mailboxIds?: string[];
  kind?: WorkflowKind;
  includeDeleted?: boolean;
}): Promise<LoadedDefinition[]> {
  const where = opts.includeDeleted ? [] : [isNull(workflow.deletedAt)];
  if (opts.workspaceId) where.push(eq(workflow.workspaceId, opts.workspaceId));
  if (opts.kind) where.push(eq(workflow.kind, opts.kind));
  if (opts.mailboxIds) {
    if (opts.mailboxIds.length === 0) return [];
    where.push(inArray(workflow.mailboxId, opts.mailboxIds));
  }

  const rows = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(
      workflowRevision,
      and(
        eq(workflowRevision.workflowId, workflow.id),
        eq(workflowRevision.revision, workflow.revision),
      ),
    )
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(workflow.sortOrder), asc(workflow.createdAt));

  return rows.map((row) => ({
    definition: row.definition,
    revisionId: row.revision.id,
    graph: row.revision.graph,
  }));
}

export async function setDefinitionEnabled(workflowId: string, enabled: boolean): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(workflow)
      .set({ enabled, updatedAt: now })
      .where(
        and(
          eq(workflow.id, workflowId),
          isNull(workflow.deletedAt),
          eq(workflow.enabled, !enabled),
        ),
      )
      .returning({ id: workflow.id, kind: workflow.kind });
    if (updated.length === 0) {
      const [row] = await tx
        .select({ id: workflow.id })
        .from(workflow)
        .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)));
      return !!row;
    }
    if (enabled) await rearmTriggers(tx, workflowId, now);
    else if (updated[0]?.kind === "user") {
      await cancelPendingRuns(tx, workflowId, now);
    }
    return true;
  });
}

export async function softDeleteDefinition(workflowId: string): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(workflow)
      .set({ deletedAt: now, enabled: false, updatedAt: now })
      .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)))
      .returning({ id: workflow.id });
    if (updated.length === 0) return false;

    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: now })
      .where(eq(workflowTrigger.workflowId, workflowId));

    await cancelPendingRuns(tx, workflowId, now);
    await clearWorkflowOutputs(tx, workflowId);

    await tx.delete(workflowPayload).where(eq(workflowPayload.workflowId, workflowId));
    return true;
  });
}

async function clearWorkflowOutputs(tx: Executor, workflowId: string): Promise<void> {
  await tx
    .update(workflowNodeRun)
    .set({ output: null })
    .where(
      and(
        inArray(
          workflowNodeRun.runId,
          tx
            .select({ id: workflowRun.id })
            .from(workflowRun)
            .where(eq(workflowRun.workflowId, workflowId)),
        ),
        ne(workflowNodeRun.inputKey, BARRIER_INPUT_KEY),
        isNotNull(workflowNodeRun.output),
      ),
    );
}

export interface CancelResult {
  cancelled: boolean;
  reason?: string;
}

export async function cancelBuiltinWorkflow(workflowId: string): Promise<CancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const started = await tx
      .select({ id: workflowRun.id, status: workflowRun.status })
      .from(workflowRun)
      .innerJoin(workflowOccurrence, eq(workflowOccurrence.id, workflowRun.occurrenceId))
      .innerJoin(workflowTrigger, eq(workflowTrigger.id, workflowOccurrence.triggerId))
      .where(and(eq(workflowRun.workflowId, workflowId), eq(workflowTrigger.kind, "trigger.once")));

    const dispatched = started.filter(
      (row) => row.status === "running" || row.status === "completed" || row.status === "partial",
    );
    const [executing] = await tx
      .select({ id: workflowRun.id })
      .from(workflowRun)
      .where(and(eq(workflowRun.workflowId, workflowId), eq(workflowRun.status, "running")))
      .limit(1);
    if (executing) {
      return {
        cancelled: false,
        reason: "That is still being handled — try again in a moment",
      };
    }
    const [current] = await tx
      .select({ graph: workflowRevision.graph })
      .from(workflow)
      .innerJoin(
        workflowRevision,
        and(
          eq(workflowRevision.workflowId, workflow.id),
          eq(workflowRevision.revision, workflow.revision),
        ),
      )
      .where(eq(workflow.id, workflowId))
      .limit(1);
    const sendNodes = (current?.graph.nodes ?? [])
      .filter((node) => node.kind === "action.send")
      .map((node) => node.id);
    const sendRuns =
      sendNodes.length === 0
        ? []
        : await tx
            .select({ status: workflowNodeRun.status })
            .from(workflowNodeRun)
            .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
            .where(
              and(
                eq(workflowRun.workflowId, workflowId),
                inArray(workflowNodeRun.nodeId, sendNodes),
                inArray(workflowNodeRun.status, ["dispatching", "unknown", "completed"]),
              ),
            );
    const [unresolved] = await tx
      .select({ id: workflowNodeRun.id })
      .from(workflowNodeRun)
      .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
      .where(
        and(
          eq(workflowRun.workflowId, workflowId),
          inArray(workflowNodeRun.status, ["running", "dispatching", "unknown"]),
          isNull(workflowNodeRun.resolvedAt),
        ),
      )
      .limit(1);
    if (unresolved) {
      return {
        cancelled: false,
        reason:
          "A step of this item has an unresolved outcome — check the message before cancelling",
      };
    }
    if (dispatched.length > 0 || sendRuns.length > 0) {
      return {
        cancelled: false,
        reason: "That has already started — it can no longer be called back",
      };
    }

    const updated = await tx
      .update(workflow)
      .set({ deletedAt: now, enabled: false, updatedAt: now })
      .where(and(eq(workflow.id, workflowId), isNull(workflow.deletedAt)))
      .returning({ id: workflow.id });

    if (updated.length === 0) {
      return { cancelled: false, reason: "That item is already gone" };
    }

    await tx
      .update(workflowTrigger)
      .set({ armed: false, nextDueAt: null, updatedAt: now })
      .where(eq(workflowTrigger.workflowId, workflowId));

    await cancelPendingRuns(tx, workflowId, now);
    await clearWorkflowOutputs(tx, workflowId);

    await tx.delete(workflowPayload).where(eq(workflowPayload.workflowId, workflowId));

    return { cancelled: true };
  });
}

export async function rescheduleOnce(opts: {
  workflowId: string;
  at: Date;
}): Promise<CancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const runs = await tx
      .select({ status: workflowRun.status })
      .from(workflowRun)
      .innerJoin(workflowOccurrence, eq(workflowOccurrence.id, workflowRun.occurrenceId))
      .innerJoin(workflowTrigger, eq(workflowTrigger.id, workflowOccurrence.triggerId))
      .where(
        and(eq(workflowRun.workflowId, opts.workflowId), eq(workflowTrigger.kind, "trigger.once")),
      );
    if (runs.some((r) => r.status !== "cancelled")) {
      return { cancelled: false, reason: "That wake-up has already started" };
    }

    const [current] = await tx
      .select({
        definition: workflow,
        revision: workflowRevision,
      })
      .from(workflow)
      .innerJoin(
        workflowRevision,
        and(
          eq(workflowRevision.workflowId, workflow.id),
          eq(workflowRevision.revision, workflow.revision),
        ),
      )
      .where(and(eq(workflow.id, opts.workflowId), isNull(workflow.deletedAt)))
      .limit(1);
    if (!current) return { cancelled: false, reason: "That item is gone" };

    const graph: WorkflowGraph = {
      ...current.revision.graph,
      nodes: current.revision.graph.nodes.map((node) =>
        node.kind === "trigger.once" ? { ...node, at: opts.at.toISOString() } : node,
      ),
    };
    const revision = current.definition.revision + 1;
    const revisionId = crypto.randomUUID();
    await tx.insert(workflowRevision).values({
      id: revisionId,
      workflowId: opts.workflowId,
      revision,
      graph,
      createdAt: now,
    });

    const resources = await tx
      .select()
      .from(workflowResource)
      .where(eq(workflowResource.revisionId, current.revision.id));
    if (resources.length > 0) {
      await tx.insert(workflowResource).values(
        resources.map((resource) => ({
          ...resource,
          id: crypto.randomUUID(),
          revisionId,
        })),
      );
    }

    await tx
      .update(workflowTrigger)
      .set({ revisionId, armed: true, nextDueAt: opts.at, updatedAt: now })
      .where(
        and(
          eq(workflowTrigger.workflowId, opts.workflowId),
          eq(workflowTrigger.kind, "trigger.once"),
        ),
      );

    await tx
      .update(workflow)
      .set({ revision, updatedAt: now })
      .where(eq(workflow.id, opts.workflowId));

    return { cancelled: true };
  });
}

export async function retargetSnooze(opts: {
  workflowId: string;
  messageId: string;
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ definition: workflow, revision: workflowRevision })
      .from(workflow)
      .innerJoin(
        workflowRevision,
        and(
          eq(workflowRevision.workflowId, workflow.id),
          eq(workflowRevision.revision, workflow.revision),
        ),
      )
      .where(and(eq(workflow.id, opts.workflowId), isNull(workflow.deletedAt)))
      .limit(1);
    if (current?.definition.kind !== "snooze") return;

    const graph: WorkflowGraph = {
      ...current.revision.graph,
      nodes: current.revision.graph.nodes.map((node) =>
        node.kind === "mailbox.source" ? { ...node, messageId: opts.messageId } : node,
      ),
    };
    const revision = current.definition.revision + 1;
    const revisionId = crypto.randomUUID();
    await tx.insert(workflowRevision).values({
      id: revisionId,
      workflowId: opts.workflowId,
      revision,
      graph,
      createdAt: now,
    });

    const resources = await tx
      .select()
      .from(workflowResource)
      .where(eq(workflowResource.revisionId, current.revision.id));
    if (resources.length > 0) {
      await tx.insert(workflowResource).values(
        resources.map((resource) => ({
          ...resource,
          id: crypto.randomUUID(),
          revisionId,
        })),
      );
    }

    await tx
      .update(workflowTrigger)
      .set({ revisionId, updatedAt: now })
      .where(eq(workflowTrigger.workflowId, opts.workflowId));

    await tx
      .update(workflow)
      .set({ revision, updatedAt: now })
      .where(eq(workflow.id, opts.workflowId));
  });
}

export async function findLiveTarget(opts: {
  mailboxId: string;
  kind: WorkflowKind;
  targetKey: string;
}): Promise<DefinitionRow | null> {
  const [row] = await db
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.mailboxId, opts.mailboxId),
        eq(workflow.kind, opts.kind),
        eq(workflow.targetKey, opts.targetKey),
        isNull(workflow.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface BuiltinListing {
  definition: DefinitionRow;
  graph: WorkflowGraph;
  wakeAt: Date | null;
  armed: boolean;
  inFlight: boolean;
  sent: boolean;
  status: RunStatus | null;
  error: string | null;
}

export async function listBuiltins(opts: {
  kind: WorkflowKind;
  mailboxIds: string[];
}): Promise<BuiltinListing[]> {
  if (opts.mailboxIds.length === 0) return [];

  const rows = await db
    .select({ definition: workflow, revision: workflowRevision })
    .from(workflow)
    .innerJoin(
      workflowRevision,
      and(
        eq(workflowRevision.workflowId, workflow.id),
        eq(workflowRevision.revision, workflow.revision),
      ),
    )
    .where(
      and(
        eq(workflow.kind, opts.kind),
        inArray(workflow.mailboxId, opts.mailboxIds),
        isNull(workflow.deletedAt),
      ),
    )
    .orderBy(asc(workflow.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.definition.id);

  const triggers = await db
    .select({
      id: workflowTrigger.id,
      workflowId: workflowTrigger.workflowId,
      nextDueAt: workflowTrigger.nextDueAt,
      armed: workflowTrigger.armed,
    })
    .from(workflowTrigger)
    .where(and(inArray(workflowTrigger.workflowId, ids), eq(workflowTrigger.kind, "trigger.once")));

  const onceIds = triggers.map((t) => t.id);
  const runs =
    onceIds.length === 0
      ? []
      : await db
          .select({
            workflowId: workflowRun.workflowId,
            status: workflowRun.status,
            error: workflowRun.error,
          })
          .from(workflowRun)
          .innerJoin(workflowOccurrence, eq(workflowOccurrence.id, workflowRun.occurrenceId))
          .where(inArray(workflowOccurrence.triggerId, onceIds))
          .orderBy(desc(workflowRun.createdAt));

  const inFlight = new Set(
    (
      await db
        .select({ workflowId: workflowRun.workflowId })
        .from(workflowRun)
        .where(
          and(
            inArray(workflowRun.workflowId, ids),
            inArray(workflowRun.status, ["pending", "running"]),
          ),
        )
    ).map((row) => row.workflowId),
  );
  const sent = new Set(
    (
      await db
        .select({ workflowId: workflowRun.workflowId })
        .from(workflowNodeRun)
        .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
        .where(
          and(
            inArray(workflowRun.workflowId, ids),
            eq(workflowNodeRun.status, "completed"),
            sql`json_extract(${workflowNodeRun.receipt}, '$.operation') = 'send'`,
          ),
        )
    ).map((row) => row.workflowId),
  );
  const wake = new Map(triggers.map((t) => [t.workflowId, t]));
  const latest = new Map<string, { status: RunStatus; error: string | null }>();
  for (const run of runs) {
    if (latest.has(run.workflowId)) continue;
    latest.set(run.workflowId, { status: run.status, error: run.error });
  }

  return rows.map((row) => ({
    definition: row.definition,
    graph: row.revision.graph,
    wakeAt: wake.get(row.definition.id)?.nextDueAt ?? null,
    armed: wake.get(row.definition.id)?.armed ?? false,
    inFlight: inFlight.has(row.definition.id),
    sent: sent.has(row.definition.id),
    status: latest.get(row.definition.id)?.status ?? null,
    error: latest.get(row.definition.id)?.error ?? null,
  }));
}

export async function upsertSystemDefinition(opts: {
  id: string;
  name: string;
  graph: WorkflowGraph;
}): Promise<LoadedDefinition> {
  const existing = await loadDefinition(opts.id);
  if (existing) {
    if (JSON.stringify(existing.graph) === JSON.stringify(opts.graph)) {
      return existing;
    }
    const revised = await reviseDefinition({
      workflowId: opts.id,
      name: opts.name,
      enabled: true,
      graph: opts.graph,
    });
    if (revised) return revised;
  }
  return saveDefinition({
    id: opts.id,
    kind: "system",
    name: opts.name,
    enabled: true,
    graph: opts.graph,
  });
}

export async function listTriggers(workflowId: string): Promise<TriggerRow[]> {
  return db.select().from(workflowTrigger).where(eq(workflowTrigger.workflowId, workflowId));
}

export async function listNewMailTriggers(workflowIds: string[]): Promise<TriggerRow[]> {
  if (workflowIds.length === 0) return [];
  return db
    .select()
    .from(workflowTrigger)
    .where(
      and(
        inArray(workflowTrigger.workflowId, workflowIds),
        eq(workflowTrigger.kind, "trigger.newMail"),
        eq(workflowTrigger.armed, true),
      ),
    );
}

export interface DueTrigger {
  trigger: TriggerRow;
  definition: DefinitionRow;
  graph: WorkflowGraph;
}

export async function dueTriggers(now: Date, limit: number): Promise<DueTrigger[]> {
  const rows = await db
    .select({
      trigger: workflowTrigger,
      definition: workflow,
      revision: workflowRevision,
    })
    .from(workflowTrigger)
    .innerJoin(workflow, eq(workflow.id, workflowTrigger.workflowId))
    .innerJoin(
      workflowRevision,
      and(
        eq(workflowRevision.workflowId, workflow.id),
        eq(workflowRevision.revision, workflow.revision),
      ),
    )
    .where(
      and(
        eq(workflowTrigger.armed, true),
        eq(workflow.enabled, true),
        isNull(workflow.deletedAt),
        lte(workflowTrigger.nextDueAt, now),
      ),
    )
    .orderBy(asc(workflowTrigger.nextDueAt))
    .limit(limit);

  return rows.map((row) => ({
    trigger: row.trigger,
    definition: row.definition,
    graph: row.revision.graph,
  }));
}

export async function updateTrigger(
  triggerId: string,
  patch: {
    nextDueAt?: Date | null;
    baselineAt?: Date | null;
    cursor?: DiscoveryCursor | null;
    armed?: boolean;
    lastRunAt?: Date | null;
    lastError?: string | null;
  },
  claimToken?: string,
): Promise<boolean> {
  const rows = await db
    .update(workflowTrigger)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(workflowTrigger.id, triggerId),
        claimToken ? eq(workflowTrigger.claimToken, claimToken) : undefined,
      ),
    )
    .returning({ id: workflowTrigger.id });
  return rows.length > 0;
}

export async function claimTrigger(
  triggerId: string,
  token: string,
  now: Date,
  staleMs: number,
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - staleMs);
  const rows = await db
    .update(workflowTrigger)
    .set({ claimedAt: now, claimToken: token })
    .where(
      and(
        eq(workflowTrigger.id, triggerId),
        or(isNull(workflowTrigger.claimedAt), lt(workflowTrigger.claimedAt, staleBefore)),
      ),
    )
    .returning({ id: workflowTrigger.id });
  return rows.length > 0;
}

export async function releaseTrigger(triggerId: string, token: string): Promise<void> {
  await db
    .update(workflowTrigger)
    .set({ claimedAt: null, claimToken: null })
    .where(and(eq(workflowTrigger.id, triggerId), eq(workflowTrigger.claimToken, token)));
}

export interface OpenOccurrence {
  workflowId: string;
  triggerId: string;
  revisionId: string;
  key: string;
  scheduledFor: Date;
  kind: WorkflowKind;
  workspaceId: string | null;
  principalUserId: string | null;
  input: RunInput;
  dueAt: Date;
  triggerPatch?: Parameters<typeof updateTrigger>[1];
  withoutRun?: boolean;
}

export async function openOccurrence(opts: OpenOccurrence): Promise<string | null> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const occurrenceId = crypto.randomUUID();
    const inserted = await tx
      .insert(workflowOccurrence)
      .values({
        id: occurrenceId,
        workflowId: opts.workflowId,
        triggerId: opts.triggerId,
        key: opts.key,
        scheduledFor: opts.scheduledFor,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [workflowOccurrence.triggerId, workflowOccurrence.key],
      })
      .returning({ id: workflowOccurrence.id });

    if (opts.triggerPatch) {
      await tx
        .update(workflowTrigger)
        .set({ ...opts.triggerPatch, updatedAt: now })
        .where(eq(workflowTrigger.id, opts.triggerId));
    }

    if (inserted.length === 0 || opts.withoutRun) return null;

    const runId = crypto.randomUUID();
    await tx.insert(workflowRun).values({
      id: runId,
      workflowId: opts.workflowId,
      revisionId: opts.revisionId,
      occurrenceId,
      kind: opts.kind,
      workspaceId: opts.workspaceId,
      principalUserId: opts.principalUserId,
      input: opts.input,
      status: "pending",
      dueAt: opts.dueAt,
      attempts: 0,
      createdAt: now,
    });
    return runId;
  });
}

const CLAIM_SLICES: readonly (readonly WorkflowKind[])[] = [
  ["scheduled-send", "snooze"],
  ["user"],
  ["system"],
];

let claimRotation = 0;

async function claimSlice(opts: {
  now: Date;
  limit: number;
  owner: string;
  leaseMs: number;
  kinds?: readonly WorkflowKind[];
}): Promise<RunRow[]> {
  if (opts.limit <= 0) return [];
  const { now, owner, leaseMs } = opts;
  const leaseUntil = new Date(now.getTime() + leaseMs);

  const candidates = db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        or(
          and(eq(workflowRun.status, "pending"), lte(workflowRun.dueAt, now)),
          and(eq(workflowRun.status, "running"), lt(workflowRun.leaseExpiresAt, now)),
        ),
        opts.kinds ? inArray(workflowRun.kind, [...opts.kinds]) : undefined,
      ),
    )
    .orderBy(asc(workflowRun.dueAt))
    .limit(opts.limit);

  return db
    .update(workflowRun)
    .set({
      status: "running",
      leaseOwner: owner,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: leaseUntil,
      attempts: sql`${workflowRun.attempts} + 1`,
      startedAt: now,
    })
    .where(inArray(workflowRun.id, candidates))
    .returning();
}

export async function claimRuns(opts: {
  now: Date;
  limit: number;
  owner: string;
  leaseMs: number;
}): Promise<RunRow[]> {
  const claimed: RunRow[] = [];
  const share = Math.max(1, Math.floor(opts.limit / CLAIM_SLICES.length));
  const offset = claimRotation % CLAIM_SLICES.length;
  claimRotation += 1;
  const order = [...CLAIM_SLICES.slice(offset), ...CLAIM_SLICES.slice(0, offset)];

  for (const kinds of order) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each slice's limit depends on how many runs the earlier slices claimed
    const rows = await claimSlice({
      ...opts,
      limit: Math.min(share, opts.limit - claimed.length),
      kinds,
    });
    claimed.push(...rows);
  }

  const rest = await claimSlice({
    ...opts,
    limit: opts.limit - claimed.length,
  });
  claimed.push(...rest);

  return claimed;
}

export async function claimRun(opts: {
  runId: string;
  now: Date;
  owner: string;
  leaseMs: number;
}): Promise<RunRow | null> {
  const rows = await db
    .update(workflowRun)
    .set({
      status: "running",
      leaseOwner: opts.owner,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: new Date(opts.now.getTime() + opts.leaseMs),
      attempts: sql`${workflowRun.attempts} + 1`,
      startedAt: opts.now,
    })
    .where(
      and(
        eq(workflowRun.id, opts.runId),
        or(
          eq(workflowRun.status, "pending"),
          and(eq(workflowRun.status, "running"), lt(workflowRun.leaseExpiresAt, opts.now)),
        ),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function heartbeatRun(runId: string, token: string, until: Date): Promise<boolean> {
  const rows = await db
    .update(workflowRun)
    .set({ leaseExpiresAt: until })
    .where(and(eq(workflowRun.id, runId), eq(workflowRun.leaseToken, token)))
    .returning({ id: workflowRun.id });
  return rows.length > 0;
}

export async function settleRun(opts: {
  runId: string;
  token: string;
  status: RunStatus;
  error?: string | null;
  summary?: RunSummaryLine[];
  retryAt?: Date | null;
  restoreAttempt?: boolean;
  retainOutputs: boolean;
  definition?: "enable" | "retire";
  blocked?: boolean;
}): Promise<boolean> {
  const now = new Date();
  const retry = opts.retryAt ?? null;
  const blockedAt = opts.blocked ? now : null;
  const retain = opts.retainOutputs && !retry && isResumableStatus(opts.status);
  const owned = and(eq(workflowRun.id, opts.runId), eq(workflowRun.leaseToken, opts.token));
  return db.transaction(async (tx) => {
    let rows = await tx
      .update(workflowRun)
      .set(
        retry
          ? {
              status: "pending",
              dueAt: retry,
              leaseOwner: null,
              leaseToken: null,
              leaseExpiresAt: null,
              blockedAt,
              error: opts.error ?? null,
              summary: opts.summary,
              ...(opts.restoreAttempt
                ? { attempts: sql`max(${workflowRun.attempts} - 1, 0)` }
                : {}),
            }
          : {
              status: opts.status,
              finishedAt: now,
              leaseOwner: null,
              leaseToken: null,
              leaseExpiresAt: null,
              blockedAt,
              error: opts.error ?? null,
              summary: opts.summary,
            },
      )
      .where(retry ? and(owned, ne(workflowRun.status, "cancelled")) : owned)
      .returning({ id: workflowRun.id, workflowId: workflowRun.workflowId });
    const requeued = !!retry && rows.length > 0;
    if (retry && !requeued) {
      rows = await tx
        .update(workflowRun)
        .set({
          finishedAt: now,
          leaseOwner: null,
          leaseToken: null,
          leaseExpiresAt: null,
          error: opts.error ?? null,
          summary: opts.summary,
        })
        .where(and(owned, eq(workflowRun.status, "cancelled")))
        .returning({ id: workflowRun.id, workflowId: workflowRun.workflowId });
    }
    const [owner] = rows;
    if (!owner) return false;
    if (!requeued && !retain) {
      await clearRunOutputs(tx, opts.runId);
    }
    if (opts.definition && !requeued) {
      await tx
        .update(workflow)
        .set(
          opts.definition === "enable"
            ? { enabled: true, updatedAt: now }
            : { deletedAt: now, enabled: false, updatedAt: now },
        )
        .where(and(eq(workflow.id, owner.workflowId), isNull(workflow.deletedAt)));
      if (opts.definition === "retire") {
        await tx
          .update(workflowTrigger)
          .set({ armed: false, nextDueAt: null, updatedAt: now })
          .where(eq(workflowTrigger.workflowId, owner.workflowId));
      }
    }
    return true;
  });
}

export async function releaseRun(run: RunRow): Promise<boolean> {
  if (!run.leaseToken) return false;
  const owned = and(eq(workflowRun.id, run.id), eq(workflowRun.leaseToken, run.leaseToken));
  const rows = await db
    .update(workflowRun)
    .set({
      status: "pending",
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      attempts: sql`max(${workflowRun.attempts} - 1, 0)`,
    })
    .where(and(owned, ne(workflowRun.status, "cancelled")))
    .returning({ id: workflowRun.id });
  if (rows.length > 0) return true;
  const now = new Date();
  return db.transaction(async (tx) => {
    const stopped = await tx
      .update(workflowRun)
      .set({
        finishedAt: now,
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        attempts: sql`max(${workflowRun.attempts} - 1, 0)`,
      })
      .where(and(owned, eq(workflowRun.status, "cancelled")))
      .returning({ id: workflowRun.id });
    if (stopped.length === 0) return false;
    await clearRunOutputs(tx, run.id);
    return true;
  });
}

async function clearRunOutputs(tx: Executor, runId: string): Promise<void> {
  await tx
    .update(workflowNodeRun)
    .set({ output: null })
    .where(and(eq(workflowNodeRun.runId, runId), ne(workflowNodeRun.inputKey, BARRIER_INPUT_KEY)));
}

async function countNodeRuns(tx: Executor, runId: string, statuses: NodeStatus[]): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)` })
    .from(workflowNodeRun)
    .where(and(eq(workflowNodeRun.runId, runId), inArray(workflowNodeRun.status, statuses)));
  return row?.n ?? 0;
}

async function closeStrandedCancel(
  tx: Executor,
  runId: string,
  leaseToken: string,
  now: Date,
): Promise<boolean> {
  const closed = await tx
    .update(workflowRun)
    .set({
      finishedAt: now,
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.leaseToken, leaseToken),
        eq(workflowRun.status, "cancelled"),
      ),
    )
    .returning({ revisionId: workflowRun.revisionId });
  const [run] = closed;
  if (!run) return false;
  await closeCancelledNodes(tx, runId, run.revisionId, now);
  return true;
}

async function closeCancelledNodes(
  tx: Executor,
  runId: string,
  revisionId: string,
  now: Date,
): Promise<void> {
  const [revision] = await tx
    .select({ graph: workflowRevision.graph })
    .from(workflowRevision)
    .where(eq(workflowRevision.id, revisionId))
    .limit(1);
  const actions = (revision?.graph.nodes ?? [])
    .filter((node) => node.kind.startsWith("action."))
    .map((node) => node.id);

  await tx
    .update(workflowNodeRun)
    .set({
      status: "unknown",
      error:
        "The run was cancelled while this step was in progress, and its outcome was never confirmed",
      finishedAt: now,
    })
    .where(
      and(
        eq(workflowNodeRun.runId, runId),
        or(
          eq(workflowNodeRun.status, "dispatching"),
          and(eq(workflowNodeRun.status, "running"), inArray(workflowNodeRun.nodeId, actions)),
        ),
      ),
    );
  await tx
    .update(workflowNodeRun)
    .set({
      status: "failed",
      error: "Stopped when the run was cancelled",
      finishedAt: now,
    })
    .where(and(eq(workflowNodeRun.runId, runId), eq(workflowNodeRun.status, "running")));
  await clearRunOutputs(tx, runId);
}

export async function closeStrandedCancels(now: Date): Promise<number> {
  const stranded = await db
    .select({ id: workflowRun.id, leaseToken: workflowRun.leaseToken })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.status, "cancelled"),
        isNotNull(workflowRun.leaseToken),
        lt(workflowRun.leaseExpiresAt, now),
      ),
    )
    .limit(50);
  let closed = 0;
  for (const row of stranded) {
    if (!row.leaseToken) continue;
    const token = row.leaseToken;
    if (
      // oxlint-disable-next-line eslint/no-await-in-loop -- each close is its own write transaction; SQLite takes one writer at a time
      await db.transaction((tx) => closeStrandedCancel(tx, row.id, token, now))
    ) {
      closed += 1;
    }
  }
  return closed;
}

export type RunCancelResult =
  | { state: "cancelled"; unresolved: number }
  | { state: "stopping"; inFlight: number }
  | { state: "finished"; status: RunStatus };

export async function cancelRun(runId: string): Promise<RunCancelResult> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const queued = await tx
      .update(workflowRun)
      .set({ status: "cancelled", finishedAt: now })
      .where(and(eq(workflowRun.id, runId), eq(workflowRun.status, "pending")))
      .returning({ revisionId: workflowRun.revisionId });
    const [waiting] = queued;
    if (waiting) {
      await closeCancelledNodes(tx, runId, waiting.revisionId, now);
      return {
        state: "cancelled",
        unresolved: await countNodeRuns(tx, runId, ["dispatching", "unknown"]),
      };
    }

    const active = await tx
      .update(workflowRun)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(workflowRun.id, runId),
          or(
            eq(workflowRun.status, "running"),
            and(eq(workflowRun.status, "cancelled"), isNotNull(workflowRun.leaseToken)),
          ),
        ),
      )
      .returning({
        revisionId: workflowRun.revisionId,
        leaseToken: workflowRun.leaseToken,
        leaseExpiresAt: workflowRun.leaseExpiresAt,
      });
    const [held] = active;
    if (held) {
      const abandoned =
        !held.leaseToken || !held.leaseExpiresAt || held.leaseExpiresAt.getTime() < now.getTime();
      if (!abandoned) {
        return {
          state: "stopping",
          inFlight: await countNodeRuns(tx, runId, ["running", "dispatching"]),
        };
      }
      if (held.leaseToken) {
        await closeStrandedCancel(tx, runId, held.leaseToken, now);
      } else {
        await tx.update(workflowRun).set({ finishedAt: now }).where(eq(workflowRun.id, runId));
        await closeCancelledNodes(tx, runId, held.revisionId, now);
      }
      return {
        state: "cancelled",
        unresolved: await countNodeRuns(tx, runId, ["dispatching", "unknown"]),
      };
    }

    const [row] = await tx
      .select({ status: workflowRun.status })
      .from(workflowRun)
      .where(eq(workflowRun.id, runId))
      .limit(1);
    return { state: "finished", status: row?.status ?? "cancelled" };
  });
}

export const RESUMABLE_RUN_STATUSES = [
  "failed",
  "partial",
  "blocked",
] as const satisfies readonly RunStatus[];

export const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const RESUMABLE_KINDS = [
  "user",
  "scheduled-send",
] as const satisfies readonly WorkflowKind[];

export function isResumableStatus(status: RunStatus): boolean {
  return (RESUMABLE_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

export function isResumableKind(kind: WorkflowKind): boolean {
  return (RESUMABLE_KINDS as readonly WorkflowKind[]).includes(kind);
}

export async function expireRetainedOutputs(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RESUME_WINDOW_MS);
  const expired = db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        inArray(workflowRun.kind, [...RESUMABLE_KINDS]),
        inArray(workflowRun.status, [...RESUMABLE_RUN_STATUSES]),
        lt(workflowRun.finishedAt, cutoff),
      ),
    );
  const cleared = await db
    .update(workflowNodeRun)
    .set({ output: null })
    .where(
      and(
        inArray(workflowNodeRun.runId, expired),
        ne(workflowNodeRun.inputKey, BARRIER_INPUT_KEY),
        isNotNull(workflowNodeRun.output),
      ),
    )
    .returning({ id: workflowNodeRun.id });
  return cleared.length;
}

export type ResumeRefusal =
  | "in-progress"
  | "completed"
  | "cancelled"
  | "unsupported"
  | "deleted"
  | "disabled"
  | "expired"
  | "ambiguous-send"
  | "send-closed"
  | "outputs-missing"
  | "payload-missing"
  | "nothing-to-retry";

export type RunResumeResult =
  | { state: "resumed"; retrying: number; kept: number }
  | { state: "refused"; reason: ResumeRefusal; status: RunStatus };

const RETRYABLE_NODE_STATUSES = new Set<NodeStatus>(["failed", "blocked", "pending", "running"]);

function carriesOn(output: NodeRunOutput | null, handle: string): boolean {
  const outputs = output?.outputs;
  if (!outputs) return false;
  return outputs.some((out) => out.handle === handle && out.envelopes.length > 0);
}

export async function resumeRun(runId: string, now: Date): Promise<RunResumeResult | null> {
  const [row] = await db
    .select({
      status: workflowRun.status,
      kind: workflowRun.kind,
      workflowId: workflowRun.workflowId,
      finishedAt: workflowRun.finishedAt,
      leaseToken: workflowRun.leaseToken,
      enabled: workflow.enabled,
      deletedAt: workflow.deletedAt,
      graph: workflowRevision.graph,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return null;
  const refuse = (reason: ResumeRefusal): RunResumeResult => ({
    state: "refused",
    reason,
    status: row.status,
  });

  if (!isResumableKind(row.kind)) return refuse("unsupported");
  if (row.status === "completed") return refuse("completed");
  if (row.status === "cancelled") return refuse("cancelled");
  if (!isResumableStatus(row.status) || !row.finishedAt || row.leaseToken) {
    return refuse("in-progress");
  }
  if (row.deletedAt) return refuse("deleted");
  if (row.kind === "user" && !row.enabled) return refuse("disabled");
  if (row.finishedAt.getTime() < now.getTime() - RESUME_WINDOW_MS) {
    return refuse("expired");
  }

  const nodeRuns = await db
    .select({
      nodeId: workflowNodeRun.nodeId,
      inputKey: workflowNodeRun.inputKey,
      status: workflowNodeRun.status,
      output: workflowNodeRun.output,
      resolution: workflowNodeRun.resolution,
    })
    .from(workflowNodeRun)
    .where(eq(workflowNodeRun.runId, runId))
    .then((rows) =>
      rows.map(({ output, ...rest }) => ({
        ...rest,
        output,
        hasOutput: output !== null,
      })),
    );

  const kinds = new Map(row.graph.nodes.map((n) => [n.id, n.kind]));
  const unsettledSends = nodeRuns.filter((n) => {
    const kind = kinds.get(n.nodeId);
    return (n.status === "dispatching" || n.status === "unknown") && !!kind && isDispatchNode(kind);
  });
  if (unsettledSends.some((n) => !n.resolution)) {
    return refuse("ambiguous-send");
  }
  if (unsettledSends.length > 0) return refuse("send-closed");

  const feeding = new Set(row.graph.edges.map((edge) => edge.source));
  const missing = nodeRuns.some(
    (n) =>
      n.status === "completed" &&
      n.inputKey !== BARRIER_INPUT_KEY &&
      !n.hasOutput &&
      feeding.has(n.nodeId),
  );
  if (missing) return refuse("outputs-missing");

  const dispatchNodes = row.graph.nodes
    .filter((node) => isDispatchNode(node.kind))
    .map((node) => node.id);
  const dispatched = nodeRuns.some(
    (n) => n.status === "completed" && dispatchNodes.includes(n.nodeId),
  );
  if (dispatchNodes.length > 0 && !dispatched) {
    const [payload] = await db
      .select({ id: workflowPayload.workflowId })
      .from(workflowPayload)
      .where(eq(workflowPayload.workflowId, row.workflowId))
      .limit(1);
    if (!payload) return refuse("payload-missing");
  }

  const started = new Set(nodeRuns.map((n) => n.nodeId));
  const unstarted = new Set(
    row.graph.edges
      .filter(
        (edge) =>
          !started.has(edge.target) &&
          nodeRuns.some(
            (n) =>
              n.nodeId === edge.source &&
              n.status === "completed" &&
              n.resolution?.outcome === "verified" &&
              carriesOn(n.output, edge.sourceHandle),
          ),
      )
      .map((edge) => edge.target),
  );
  const retrying =
    nodeRuns.filter((n) => RETRYABLE_NODE_STATUSES.has(n.status)).length + unstarted.size;
  if (retrying === 0 && nodeRuns.length > 0) {
    return refuse("nothing-to-retry");
  }
  const kept = nodeRuns.filter(
    (n) => n.status === "completed" && n.inputKey !== BARRIER_INPUT_KEY,
  ).length;

  const claimed = await db
    .update(workflowRun)
    .set({
      status: "pending",
      dueAt: now,
      finishedAt: null,
      blockedAt: null,
      error: null,
      attempts: 0,
    })
    .where(
      and(
        eq(workflowRun.id, runId),
        eq(workflowRun.status, row.status),
        eq(workflowRun.finishedAt, row.finishedAt),
        isNull(workflowRun.leaseToken),
      ),
    )
    .returning({ id: workflowRun.id });
  if (claimed.length === 0) return refuse("in-progress");
  return { state: "resumed", retrying, kept };
}

export async function runIsCancelled(runId: string): Promise<boolean> {
  const [row] = await db
    .select({
      status: workflowRun.status,
      deletedAt: workflow.deletedAt,
      kind: workflow.kind,
      enabled: workflow.enabled,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return true;
  return (
    row.status === "cancelled" || row.deletedAt !== null || (row.kind === "user" && !row.enabled)
  );
}

export async function sendReceipted(runId: string): Promise<boolean> {
  const rows = await db
    .select({ receipt: workflowNodeRun.receipt })
    .from(workflowNodeRun)
    .where(and(eq(workflowNodeRun.runId, runId), eq(workflowNodeRun.status, "completed")));
  return rows.some((row) => row.receipt?.operation === "send");
}

function redactSentEnvelope(envelope: Envelope): Envelope {
  if (envelope.port === "draft") {
    return {
      ...envelope,
      draft: {
        ...envelope.draft,
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        bodyHtml: undefined,
        bodyText: undefined,
      },
    };
  }
  if (envelope.port === "message") {
    return {
      ...envelope,
      message: {
        ...envelope.message,
        from: "",
        fromName: undefined,
        to: [],
        cc: [],
        subject: "",
      },
    };
  }
  return envelope;
}

export async function redactSentOutputs(runId: string): Promise<void> {
  const rows = await db
    .select({ id: workflowNodeRun.id, output: workflowNodeRun.output })
    .from(workflowNodeRun)
    .where(
      and(
        eq(workflowNodeRun.runId, runId),
        isNotNull(workflowNodeRun.output),
        ne(workflowNodeRun.inputKey, BARRIER_INPUT_KEY),
      ),
    );
  await Promise.all(
    rows.flatMap((row) => {
      const stored = row.output;
      if (!stored?.outputs?.length) return [];
      const redacted: NodeRunOutput = {
        ...stored,
        outputs: stored.outputs.map((out) => ({
          ...out,
          envelopes: out.envelopes.map(redactSentEnvelope),
        })),
      };
      return [
        db.update(workflowNodeRun).set({ output: redacted }).where(eq(workflowNodeRun.id, row.id)),
      ];
    }),
  );
}

export async function nodeUnresolvedFor(workflowId: string, nodeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowNodeRun.id })
    .from(workflowNodeRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        eq(workflowNodeRun.nodeId, nodeId),
        inArray(workflowNodeRun.status, ["running", "dispatching", "unknown"]),
      ),
    )
    .limit(1);
  return !!row;
}

export async function nodeCompletedFor(workflowId: string, nodeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowNodeRun.id })
    .from(workflowNodeRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        eq(workflowNodeRun.nodeId, nodeId),
        eq(workflowNodeRun.status, "completed"),
      ),
    )
    .limit(1);
  return !!row;
}

export async function hasInFlightRun(workflowId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(
      and(
        eq(workflowRun.workflowId, workflowId),
        or(inArray(workflowRun.status, ["pending", "running"]), isNotNull(workflowRun.leaseToken)),
      ),
    )
    .limit(1);
  return !!row;
}

export async function runTriggerKind(runId: string): Promise<TriggerKind | null> {
  const [row] = await db
    .select({ kind: workflowTrigger.kind })
    .from(workflowRun)
    .innerJoin(workflowOccurrence, eq(workflowOccurrence.id, workflowRun.occurrenceId))
    .innerJoin(workflowTrigger, eq(workflowTrigger.id, workflowOccurrence.triggerId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  return row?.kind ?? null;
}

export async function latestRunId(workflowId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: workflowRun.id })
    .from(workflowRun)
    .where(eq(workflowRun.workflowId, workflowId))
    .orderBy(desc(workflowRun.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function getRun(runId: string): Promise<RunRow | null> {
  const [row] = await db.select().from(workflowRun).where(eq(workflowRun.id, runId)).limit(1);
  return row ?? null;
}

export async function listNodeRuns(runId: string): Promise<NodeRunRow[]> {
  return db.select().from(workflowNodeRun).where(eq(workflowNodeRun.runId, runId));
}

export async function beginNodeRun(opts: {
  runId: string;
  leaseToken: string;
  nodeId: string;
  inputKey: string;
  branch?: string | null;
  status: NodeStatus;
  receipt?: NodeReceipt | null;
}): Promise<NodeRunRow | null> {
  const values: Partial<NodeRunRow> = {
    id: crypto.randomUUID(),
    runId: opts.runId,
    nodeId: opts.nodeId,
    inputKey: opts.inputKey,
    branch: opts.branch ?? null,
    status: opts.status,
    receipt: opts.receipt ?? null,
    attempts: 1,
    startedAt: new Date(),
  };
  const columns = getTableColumns(workflowNodeRun);
  const fields = recordOf(keysOf(columns), (key) => {
    const value = values[key];
    return (
      value === null || value === undefined ? sql`null` : sql`${sql.param(value, columns[key])}`
    ).as(key);
  });
  const rows = await db
    .insert(workflowNodeRun)
    .select(
      db
        .select(fields)
        .from(workflowRun)
        .where(and(eq(workflowRun.id, opts.runId), eq(workflowRun.leaseToken, opts.leaseToken))),
    )
    .onConflictDoNothing({
      target: [workflowNodeRun.runId, workflowNodeRun.nodeId, workflowNodeRun.inputKey],
    })
    .returning();
  return rows[0] ?? null;
}

export async function reclaimNodeRun(opts: {
  id: string;
  runId: string;
  leaseToken: string;
  status: NodeStatus;
}): Promise<boolean> {
  const rows = await db
    .update(workflowNodeRun)
    .set({
      status: opts.status,
      attempts: sql`${workflowNodeRun.attempts} + 1`,
      error: null,
      output: null,
      receipt: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .where(
      and(
        eq(workflowNodeRun.id, opts.id),
        inArray(workflowNodeRun.status, ["failed", "blocked", "running", "pending"]),
        ownsRun(opts.runId, opts.leaseToken),
      ),
    )
    .returning({ id: workflowNodeRun.id });
  return rows.length > 0;
}

function ownsRun(runId: string, leaseToken: string) {
  return sql`exists (select 1 from ${workflowRun} where ${workflowRun.id} = ${runId} and ${workflowRun.leaseToken} = ${leaseToken})`;
}

export async function findNodeRun(
  runId: string,
  nodeId: string,
  inputKey: string,
): Promise<NodeRunRow | null> {
  const [row] = await db
    .select()
    .from(workflowNodeRun)
    .where(
      and(
        eq(workflowNodeRun.runId, runId),
        eq(workflowNodeRun.nodeId, nodeId),
        eq(workflowNodeRun.inputKey, inputKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function reconcileNodeRun(opts: {
  id: string;
  status: "completed" | "failed";
  receipt?: NodeReceipt | null;
  error?: string | null;
}): Promise<boolean> {
  const rows = await db
    .update(workflowNodeRun)
    .set({
      status: opts.status,
      receipt: opts.receipt ?? null,
      error: opts.error ?? null,
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(workflowNodeRun.id, opts.id),
        eq(workflowNodeRun.status, "unknown"),
        isNull(workflowNodeRun.resolvedAt),
      ),
    )
    .returning({ id: workflowNodeRun.id });
  return rows.length > 0;
}

export async function resolveSendNodeRun(opts: {
  id: string;
  runId: string;
  mailboxId: string;
  byUserId: string;
  now: Date;
  resolution: NodeResolution;
  completion?: {
    receipt: NodeReceipt & { providerMessageId: string; fingerprint: string };
    sentBetween: { from: Date; to: Date };
    output: NodeRunOutput;
  };
}): Promise<boolean> {
  const { resolution, completion } = opts;
  const unclaimed = completion
    ? notExists(
        receiptHolder({
          mailboxId: opts.mailboxId,
          providerMessageId: completion.receipt.providerMessageId,
          fingerprint: completion.receipt.fingerprint,
          exceptNodeRunId: opts.id,
          sentBetween: completion.sentBetween,
        }),
      )
    : undefined;
  const settledRun = sql`exists (select 1 from ${workflowRun} where ${workflowRun.id} = ${opts.runId} and ${workflowRun.finishedAt} is not null and ${workflowRun.leaseToken} is null and ${workflowRun.status} not in ('pending', 'running'))`;
  const rows = await db
    .update(workflowNodeRun)
    .set({
      resolution,
      resolvedByUserId: opts.byUserId,
      resolvedAt: opts.now,
      ...(completion
        ? {
            status: "completed" as const,
            receipt: completion.receipt,
            output: completion.output,
            error: null,
          }
        : {}),
    })
    .where(
      and(
        eq(workflowNodeRun.id, opts.id),
        eq(workflowNodeRun.runId, opts.runId),
        eq(workflowNodeRun.status, resolution.previousStatus),
        isNull(workflowNodeRun.resolvedAt),
        settledRun,
        unclaimed,
      ),
    )
    .returning({ id: workflowNodeRun.id });
  return rows.length > 0;
}

export async function clearRetainedOutputs(runId: string): Promise<void> {
  await clearRunOutputs(db, runId);
}

export async function markResolutionFinished(nodeRunId: string): Promise<void> {
  await db
    .update(workflowNodeRun)
    .set({
      resolution: sql`json_set(${workflowNodeRun.resolution}, '$.finished', json('true'))`,
    })
    .where(and(eq(workflowNodeRun.id, nodeRunId), isNotNull(workflowNodeRun.resolution)));
}

export async function deferResolutionFinish(nodeRunId: string, until: Date): Promise<void> {
  await db
    .update(workflowNodeRun)
    .set({
      resolution: sql`json_set(${workflowNodeRun.resolution}, '$.finishDeferredAt', ${until.getTime()})`,
    })
    .where(and(eq(workflowNodeRun.id, nodeRunId), isNotNull(workflowNodeRun.resolution)));
}

export async function listUnfinishedResolutions(
  limit: number,
  now: Date,
): Promise<
  {
    workflowId: string;
    runId: string;
    nodeRunId: string;
    outcome: NodeResolution["outcome"];
  }[]
> {
  const rows = await db
    .select({
      workflowId: workflowRun.workflowId,
      runId: workflowRun.id,
      nodeRunId: workflowNodeRun.id,
      resolution: workflowNodeRun.resolution,
    })
    .from(workflowNodeRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
    .where(
      and(
        isNotNull(workflowNodeRun.resolvedAt),
        sql`json_extract(${workflowNodeRun.resolution}, '$.finished') is null`,
        sql`coalesce(json_extract(${workflowNodeRun.resolution}, '$.finishDeferredAt'), 0) <= ${now.getTime()}`,
      ),
    )
    .orderBy(asc(workflowNodeRun.resolvedAt))
    .limit(limit);
  return rows.flatMap((row) =>
    row.resolution
      ? [
          {
            workflowId: row.workflowId,
            runId: row.runId,
            nodeRunId: row.nodeRunId,
            outcome: row.resolution.outcome,
          },
        ]
      : [],
  );
}

interface ReceiptLookup {
  mailboxId: string;
  providerMessageId: string;
  fingerprint: string;
  exceptNodeRunId: string;
  sentBetween: { from: Date; to: Date };
}

export type ReceiptConflict = "taken" | "unidentified";

function receiptHolder(opts: ReceiptLookup) {
  const holder = alias(workflowNodeRun, "receipt_holder");
  const id = sql`json_extract(${holder.receipt}, '$.providerMessageId')`;
  const settled = sql`coalesce(json_extract(${holder.receipt}, '$.settledAt'), json_extract(${holder.receipt}, '$.dispatchedAt'))`;
  const fingerprint = sql`json_extract(${holder.receipt}, '$.fingerprint')`;
  return db
    .select({ providerMessageId: sql<string | null>`${id}` })
    .from(holder)
    .innerJoin(workflowRun, eq(workflowRun.id, holder.runId))
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .where(
      and(
        eq(workflow.mailboxId, opts.mailboxId),
        eq(holder.status, "completed"),
        ne(holder.id, opts.exceptNodeRunId),
        sql`json_extract(${holder.receipt}, '$.operation') = 'send'`,
        or(
          sql`${id} = ${opts.providerMessageId}`,
          sql`(${id} is null and ${settled} between ${opts.sentBetween.from.toISOString()} and ${opts.sentBetween.to.toISOString()} and (${fingerprint} is null or ${fingerprint} = ${opts.fingerprint}))`,
        ),
      ),
    )
    .limit(1);
}

export async function sendReceiptConflict(opts: ReceiptLookup): Promise<ReceiptConflict | null> {
  const [row] = await receiptHolder(opts);
  if (!row) return null;
  return row.providerMessageId ? "taken" : "unidentified";
}

export interface SendNodeRunRow {
  workflowId: string;
  runId: string;
  runSettled: boolean;
  nodeRun: NodeRunRow;
}

export async function listSendNodeRuns(opts: {
  workflowIds: string[];
  nodeIds: string[];
}): Promise<SendNodeRunRow[]> {
  if (opts.workflowIds.length === 0 || opts.nodeIds.length === 0) return [];
  return db
    .select({
      workflowId: workflowRun.workflowId,
      runId: workflowRun.id,
      runSettled:
        sql<boolean>`(${workflowRun.finishedAt} is not null and ${workflowRun.leaseToken} is null and ${workflowRun.status} not in ('pending', 'running'))`.mapWith(
          Boolean,
        ),
      nodeRun: workflowNodeRun,
    })
    .from(workflowNodeRun)
    .innerJoin(workflowRun, eq(workflowRun.id, workflowNodeRun.runId))
    .where(
      and(
        inArray(workflowRun.workflowId, opts.workflowIds),
        inArray(workflowNodeRun.nodeId, opts.nodeIds),
      ),
    )
    .orderBy(desc(workflowRun.createdAt));
}

export async function finishNodeRun(opts: {
  id: string;
  runId: string;
  leaseToken: string;
  status: NodeStatus;
  output?: unknown;
  outputHandles?: string[] | null;
  receipt?: NodeReceipt | null;
  error?: string | null;
}): Promise<boolean> {
  const rows = await db
    .update(workflowNodeRun)
    .set({
      status: opts.status,
      output: opts.output ?? null,
      outputHandles: opts.outputHandles ?? null,
      receipt: opts.receipt ?? null,
      error: opts.error ?? null,
      finishedAt: new Date(),
    })
    .where(and(eq(workflowNodeRun.id, opts.id), ownsRun(opts.runId, opts.leaseToken)))
    .returning({ id: workflowNodeRun.id });
  return rows.length > 0;
}

export async function putPayload(workflowId: string, payload: DraftPayload): Promise<void> {
  await db
    .insert(workflowPayload)
    .values({
      id: crypto.randomUUID(),
      workflowId,
      payload,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [workflowPayload.workflowId],
      set: { payload },
    });
}

export async function getPayload(workflowId: string): Promise<DraftPayload | null> {
  const [row] = await db
    .select({ payload: workflowPayload.payload })
    .from(workflowPayload)
    .where(eq(workflowPayload.workflowId, workflowId))
    .limit(1);
  return row?.payload ?? null;
}

export async function dropPayload(workflowId: string): Promise<void> {
  await db.delete(workflowPayload).where(eq(workflowPayload.workflowId, workflowId));
}

export async function claimDiscovery(opts: {
  now: Date;
  cadenceSec: number;
  owner: string;
  leaseMs: number;
}): Promise<string | null> {
  const { now, cadenceSec, owner, leaseMs } = opts;
  const token = crypto.randomUUID();
  const leaseUntil = new Date(now.getTime() + leaseMs);

  await db
    .insert(workflowTick)
    .values({ id: TICK_ID, nextCheckAt: now, updatedAt: now })
    .onConflictDoNothing({ target: [workflowTick.id] });

  const rows = await db
    .update(workflowTick)
    .set({
      leaseOwner: owner,
      leaseToken: token,
      leaseExpiresAt: leaseUntil,
      nextCheckAt: new Date(now.getTime() + cadenceSec * 1000),
      lastDiscoveryAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowTick.id, TICK_ID),
        or(isNull(workflowTick.nextCheckAt), lte(workflowTick.nextCheckAt, now)),
        or(isNull(workflowTick.leaseExpiresAt), lt(workflowTick.leaseExpiresAt, now)),
      ),
    )
    .returning({ id: workflowTick.id });

  return rows.length > 0 ? token : null;
}

export async function releaseDiscovery(token: string, error?: string | null): Promise<void> {
  await db
    .update(workflowTick)
    .set({
      leaseOwner: null,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: error ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(workflowTick.id, TICK_ID), eq(workflowTick.leaseToken, token)));
}

export async function recordTick(at: Date, error: string | null): Promise<void> {
  await db
    .insert(workflowTick)
    .values({
      id: TICK_ID,
      lastTickAt: at,
      lastSuccessAt: error ? null : at,
      lastError: error,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [workflowTick.id],
      set: {
        lastTickAt: sql`max(coalesce(${workflowTick.lastTickAt}, 0), ${at.getTime()})`,
        ...(error
          ? {}
          : {
              lastSuccessAt: sql`max(coalesce(${workflowTick.lastSuccessAt}, 0), ${at.getTime()})`,
            }),
        lastError: sql`case when coalesce(${workflowTick.lastTickAt}, 0) <= ${at.getTime()} then ${error} else ${workflowTick.lastError} end`,
        updatedAt: sql`max(${workflowTick.updatedAt}, ${at.getTime()})`,
      },
    });
}

export async function tickState() {
  const [row] = await db.select().from(workflowTick).where(eq(workflowTick.id, TICK_ID)).limit(1);
  return row ?? null;
}

export async function pendingRunCount(now: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(workflowRun)
    .where(and(eq(workflowRun.status, "pending"), lte(workflowRun.dueAt, now)));
  return row?.n ?? 0;
}

export interface RunHistoryRow {
  id: string;
  workflowId: string;
  workflowName: string;
  kind: WorkflowKind;
  status: RunStatus;
  dueAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempts: number;
  error: string | null;
  summary: RunSummaryLine[] | null;
  principalUserId: string | null;
  graph: WorkflowGraph;
}

export async function listRuns(opts: {
  workspaceId?: string;
  workflowId?: string;
  mailboxIds?: string[];
  kind?: WorkflowKind;
  limit: number;
}): Promise<RunHistoryRow[]> {
  const where = [];
  if (opts.workspaceId) {
    where.push(eq(workflowRun.workspaceId, opts.workspaceId));
  }
  if (opts.workflowId) where.push(eq(workflowRun.workflowId, opts.workflowId));
  if (opts.kind) where.push(eq(workflowRun.kind, opts.kind));
  if (opts.mailboxIds) {
    if (opts.mailboxIds.length === 0) return [];
    where.push(inArray(workflow.mailboxId, opts.mailboxIds));
  }

  return db
    .select({
      id: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowName: workflow.name,
      kind: workflowRun.kind,
      status: workflowRun.status,
      dueAt: workflowRun.dueAt,
      startedAt: workflowRun.startedAt,
      finishedAt: workflowRun.finishedAt,
      attempts: workflowRun.attempts,
      error: workflowRun.error,
      summary: workflowRun.summary,
      principalUserId: workflow.principalUserId,
      graph: workflowRevision.graph,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(workflowRun.createdAt))
    .limit(opts.limit);
}

export interface RunDetailRow {
  run: RunRow;
  workflowName: string;
  workflowPrincipalUserId: string | null;
  currentRevision: number;
  deletedAt: Date | null;
  revision: number;
  revisionCreatedAt: Date;
  graph: WorkflowGraph;
  scheduledFor: Date;
  nodeRuns: NodeRunRow[];
}

export async function loadRunScope(runId: string): Promise<{
  kind: WorkflowKind;
  status: RunStatus;
  workspaceId: string | null;
  principalUserId: string | null;
  graph: WorkflowGraph;
  definition: DefinitionRow;
} | null> {
  const [row] = await db
    .select({
      kind: workflowRun.kind,
      status: workflowRun.status,
      definition: workflow,
      workspaceId: workflowRun.workspaceId,
      principalUserId: workflow.principalUserId,
      graph: workflowRevision.graph,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  return row ?? null;
}

export async function loadRunDetail(runId: string): Promise<RunDetailRow | null> {
  const [row] = await db
    .select({
      run: workflowRun,
      workflowName: workflow.name,
      workflowPrincipalUserId: workflow.principalUserId,
      currentRevision: workflow.revision,
      deletedAt: workflow.deletedAt,
      revision: workflowRevision.revision,
      revisionCreatedAt: workflowRevision.createdAt,
      graph: workflowRevision.graph,
      scheduledFor: workflowOccurrence.scheduledFor,
    })
    .from(workflowRun)
    .innerJoin(workflow, eq(workflow.id, workflowRun.workflowId))
    .innerJoin(workflowRevision, eq(workflowRevision.id, workflowRun.revisionId))
    .innerJoin(workflowOccurrence, eq(workflowOccurrence.id, workflowRun.occurrenceId))
    .where(eq(workflowRun.id, runId))
    .limit(1);
  if (!row) return null;
  const nodeRuns = await db
    .select()
    .from(workflowNodeRun)
    .where(eq(workflowNodeRun.runId, runId))
    .orderBy(asc(workflowNodeRun.startedAt));
  return { ...row, nodeRuns };
}

export async function listMemberIdentities(
  workspaceId: string,
  userIds: string[],
): Promise<Map<string, { name: string; email: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(
      and(eq(workspaceMember.workspaceId, workspaceId), inArray(workspaceMember.userId, userIds)),
    );
  return new Map(rows.map((r) => [r.id, { name: r.name, email: r.email }]));
}
