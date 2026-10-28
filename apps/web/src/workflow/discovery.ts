import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";

import { resolvePrincipal } from "./authorization";
import { coalesceMissed, nextCronAt } from "./cron";
import { evaluateExpression } from "./expr";
import { pollFeed } from "./feeds";
import { graphTimezone } from "./graph";
import type { RunInput } from "./runtime";
import type { GraphNode, WorkflowGraph } from "./schema";
import { stepDef } from "./steps";
import {
  claimTrigger,
  type DefinitionRow,
  type DueTrigger,
  hasInFlightRun,
  openEvent,
  releaseTrigger,
  type TriggerPatch,
  type TriggerRow,
  updateTrigger,
} from "./store";
import { analyzeGraph } from "./validation";
import { T } from "./values";

const TRIGGER_CLAIM_MS = 120_000;

export interface DiscoveryResult {
  created: number;
  error?: string;
}

function triggerNode(graph: WorkflowGraph, nodeId: string): GraphNode | null {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

function eventScope(graph: WorkflowGraph, nodeId: string) {
  const types = analyzeGraph(graph).types.get(nodeId);
  const output = types?.output ?? T.json;
  return { trigger: output, item: output, steps: {} };
}

export function passesFilter(
  graph: WorkflowGraph,
  node: GraphNode,
  event: unknown,
  now: Date,
): boolean {
  const bound = node.params.filter;
  if (bound?.kind !== "expr" || !bound.cel.trim()) return true;
  try {
    const result = evaluateExpression(
      bound.cel,
      {
        trigger: event,
        item: event,
        steps: {},
        now,
        run: { id: "", workflowId: "", workflow: "", startedAt: now.toISOString() },
        error: "",
        timezone: graphTimezone(graph, node),
      },
      eventScope(graph, node.id),
    );
    return result === true;
  } catch {
    return false;
  }
}

function limitFor(
  graph: WorkflowGraph,
  nodeId: string,
  event: unknown,
  now: Date,
): { mode: "debounce" | "throttle"; key: string; seconds: number } | undefined {
  const limit = graph.settings.limit;
  if (!limit) return undefined;
  try {
    const key = evaluateExpression(
      limit.key,
      {
        trigger: event,
        item: event,
        steps: {},
        now,
        run: { id: "", workflowId: "", workflow: "", startedAt: now.toISOString() },
        error: "",
        timezone: graphTimezone(
          graph,
          graph.nodes.find((n) => n.id === nodeId),
        ),
      },
      eventScope(graph, nodeId),
    );
    return {
      mode: limit.mode,
      key: typeof key === "string" ? key : JSON.stringify(key),
      seconds: limit.seconds,
    };
  } catch {
    return { mode: limit.mode, key: "", seconds: limit.seconds };
  }
}

export interface FireEvent {
  due: DueTrigger;
  key: string;
  scheduledFor: Date;
  event: unknown;
  input: Omit<RunInput, "triggerNodeId" | "event">;
  now: Date;
  triggerPatch?: TriggerPatch;
  baseline?: boolean;
}

export async function fireEvent(opts: FireEvent): Promise<string | null> {
  const { trigger, definition, graph } = opts.due;
  const node = triggerNode(graph, trigger.nodeId);
  const filtered = node && !passesFilter(graph, node, opts.event, opts.now);
  return openEvent({
    workflowId: definition.id,
    triggerId: trigger.id,
    revisionId: trigger.revisionId,
    key: opts.key,
    scheduledFor: opts.scheduledFor,
    kind: definition.kind,
    workspaceId: definition.workspaceId,
    principalUserId: definition.principalUserId,
    input: { ...opts.input, triggerNodeId: trigger.nodeId, event: opts.event },
    payload: opts.event,
    dueAt: opts.now,
    triggerPatch: opts.triggerPatch,
    withoutRun: opts.baseline
      ? "already there when the trigger was turned on"
      : filtered
        ? "filtered out"
        : undefined,
    limit:
      opts.baseline || filtered ? undefined : limitFor(graph, trigger.nodeId, opts.event, opts.now),
  });
}

async function discoverSchedule(due: DueTrigger, now: Date): Promise<DiscoveryResult> {
  const { trigger } = due;
  if (!trigger.cron || !trigger.nextDueAt) {
    await updateTrigger(trigger.id, { armed: false, nextDueAt: null });
    return { created: 0 };
  }
  const coalesced = coalesceMissed(trigger.cron, trigger.timezone, trigger.nextDueAt, now);
  const runId = await fireEvent({
    due,
    key: coalesced.firedFor.toISOString(),
    scheduledFor: coalesced.firedFor,
    event: {
      firedAt: now.toISOString(),
      scheduledFor: coalesced.firedFor.toISOString(),
      missed: coalesced.missed,
    },
    input: {
      source: "schedule",
      firedFor: coalesced.firedFor.toISOString(),
      missed: coalesced.missed,
    },
    now,
    triggerPatch: {
      nextDueAt: coalesced.next ?? nextCronAt(trigger.cron, trigger.timezone, now),
      lastRunAt: now,
      lastError: null,
    },
  });
  return { created: runId ? 1 : 0 };
}

async function discoverOnce(due: DueTrigger, now: Date): Promise<DiscoveryResult> {
  const { trigger, definition } = due;
  if (await hasInFlightRun(definition.id)) return { created: 0 };
  const firedFor = trigger.nextDueAt ?? now;
  const runId = await fireEvent({
    due,
    key: `once:${firedFor.toISOString()}`,
    scheduledFor: firedFor,
    event: { firedAt: now.toISOString(), scheduledFor: firedFor.toISOString(), missed: 0 },
    input: { source: "once", firedFor: firedFor.toISOString() },
    now,
    triggerPatch: { armed: false, nextDueAt: null, lastRunAt: now },
  });
  return { created: runId ? 1 : 0 };
}

async function discoverFeed(
  due: DueTrigger,
  now: Date,
  cadenceSec: number,
  signal?: AbortSignal,
): Promise<DiscoveryResult> {
  const { trigger, definition, graph } = due;
  const node = triggerNode(graph, trigger.nodeId);
  const later = new Date(now.getTime() + cadenceSec * 1000);
  if (!node) {
    await updateTrigger(trigger.id, { armed: false, nextDueAt: null });
    return { created: 0 };
  }
  const principal = await resolvePrincipal(definition);
  if (!principal.ok) {
    await updateTrigger(trigger.id, { nextDueAt: later, lastError: principal.reason });
    return { created: 0, error: principal.reason };
  }

  const token = crypto.randomUUID();
  if (!(await claimTrigger(trigger.id, token, now, TRIGGER_CLAIM_MS))) return { created: 0 };

  let created = 0;
  let error: string | undefined;
  let nextDueAt = later;
  try {
    const polled = await pollFeed({
      definition,
      principal: principal.value,
      trigger,
      node,
      now,
      token,
      signal,
    });
    for (const found of polled.events) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- events open in feed order so the committed cursor only ever covers opened events
      const runId = await fireEvent({
        due,
        key: found.key,
        scheduledFor: found.at,
        event: found.value,
        input: { source: "feed" },
        now,
        baseline: polled.baseline,
      });
      if (runId) created += 1;
    }
    await polled.commit();
    if (polled.nextDueAt && polled.nextDueAt.getTime() < nextDueAt.getTime())
      nextDueAt = polled.nextDueAt;
    error = polled.error;
  } catch (err) {
    error = sanitizeError(err);
  }
  const written = await updateTrigger(
    trigger.id,
    { nextDueAt, lastRunAt: now, lastError: error ?? null },
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
  const source = stepDef(due.trigger.kind)?.trigger;
  switch (source?.kind) {
    case "time":
      return discoverSchedule(due, now);
    case "once":
      return discoverOnce(due, now);
    case "feed":
      return discoverFeed(due, now, cadenceSec, signal);
    default:
      await updateTrigger(due.trigger.id, { nextDueAt: null });
      return { created: 0 };
  }
}

export async function requestManualRun(opts: {
  definition: DefinitionRow;
  revisionId: string;
  trigger: TriggerRow;
  graph: WorkflowGraph;
  requestedByUserId: string;
  requestedBy: { email: string; name: string };
  inputs?: Record<string, unknown>;
  event?: unknown;
}): Promise<string | null> {
  const now = new Date();
  const event =
    opts.event ??
    (stepDef(opts.trigger.kind)?.trigger?.kind === "manual"
      ? { inputs: opts.inputs ?? {}, requestedBy: opts.requestedBy, requestedAt: now.toISOString() }
      : { firedAt: now.toISOString(), scheduledFor: now.toISOString(), missed: 0 });
  return fireEvent({
    due: { trigger: opts.trigger, definition: opts.definition, graph: opts.graph },
    key: `manual:${crypto.randomUUID()}`,
    scheduledFor: now,
    event,
    input: { source: "manual", requestedByUserId: opts.requestedByUserId },
    now,
  });
}
