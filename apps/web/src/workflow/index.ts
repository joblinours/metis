import "server-only";
import { decisionEnabled } from "@/config/runtime";

import { graphMailboxIds, targetsOf } from "./graph";
import { nodeMailboxId } from "./kinds";
import { type RunResume, resumeCheckedRun } from "./resume";
import type { DecisionReceipt, NodeRunOutput, RunInput, RunSummaryLine } from "./runtime";
import type {
  NodeStatus,
  RunStatus,
  WorkflowDefinitionInput,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowKind,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowSourceState,
} from "./schema";
import { BARRIER_INPUT_KEY, workflowDefinitionInputSchema } from "./schema";
import {
  cancelRun,
  type DefinitionRow,
  listDefinitions,
  listMemberIdentities,
  listNewMailTriggers,
  listRuns,
  listTriggers,
  loadDefinition,
  loadRunDetail,
  loadRunScope,
  type RunCancelResult,
  reviseDefinition,
  saveDefinition,
  setDefinitionEnabled,
  softDeleteDefinition,
  type TriggerRow,
} from "./store";
import { requestManualRun } from "./triggers";
import { firstError, validateGraph } from "./validation";

export interface WorkflowSummary {
  id: string;
  name: string;
  kind: WorkflowKind;
  enabled: boolean;
  revision: number;
  graph: WorkflowGraph;
  mailboxIds: string[];
  sources: WorkflowSourceState[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  dueAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  error: string | null;
  steps: RunSummaryLine[];
}

export interface WorkspaceScope {
  workspaceId: string;
  userId: string;
  mailboxes: {
    mailboxId: string;
    linkId: string;
    email: string;
    aiEnabled: boolean;
  }[];
}

export interface WorkflowRunPerson {
  name: string;
  email: string;
}

export interface WorkflowRunItem {
  id: string;
  mailboxId: string | null;
  status: NodeStatus;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  detail: string | null;
  error: string | null;
  operation: string | null;
  message: { subject: string; from: string } | null;
  inputs: { port: number; state: string; count: number }[] | null;
  decision: DecisionReceipt | null;
  outputs: string[] | null;
}

export interface WorkflowRunOutput {
  handle: WorkflowEdge["sourceHandle"];
  carried: boolean | null;
}

export interface WorkflowRunNode {
  nodeId: string;
  kind: WorkflowNodeKind;
  mailboxId: string | null;
  reached: boolean;
  lines: { status: NodeStatus; count: number; detail: string | null }[];
  items: WorkflowRunItem[];
  outputs: WorkflowRunOutput[];
}

export interface WorkflowRunDetail extends WorkflowRunSummary {
  revision: number;
  revisionCreatedAt: string;
  currentRevision: number | null;
  principal: WorkflowRunPerson | null;
  trigger: {
    nodeId: string;
    kind: WorkflowNodeKind | null;
    source: RunInput["kind"];
    scheduledFor: string;
    firedFor: string | null;
    missed: number;
    messageCount: number | null;
    requestedBy: WorkflowRunPerson | null;
  };
  mailboxes: { mailboxId: string; email: string | null }[];
  graph: WorkflowGraph;
  nodes: WorkflowRunNode[];
}

function sourceStates(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  triggers: TriggerRow[],
): WorkflowSourceState[] {
  const byNode = new Map(triggers.map((t) => [t.nodeId, t]));
  return graph.nodes
    .filter((node) => node.kind === "trigger.newMail")
    .map((node) => {
      const source = targetsOf(graph, node.id).find((n) => n.kind === "mailbox.source");
      const watched = source?.kind === "mailbox.source" ? source : null;
      const row = byNode.get(node.id);
      const cursor = row?.cursor;
      return {
        triggerNodeId: node.id,
        mailboxId: watched?.mailboxId ?? null,
        paused: !definition.enabled || !row?.armed,
        baselined:
          !!cursor?.baselined &&
          !!watched &&
          cursor.mailboxId === watched.mailboxId &&
          cursor.folder === watched.folder,
        lastScanAt: row?.lastRunAt?.toISOString() ?? null,
        error: row?.lastError ?? null,
      };
    });
}

function toSummary(
  definition: DefinitionRow,
  graph: WorkflowGraph,
  triggers: TriggerRow[],
): WorkflowSummary {
  return {
    id: definition.id,
    name: definition.name,
    kind: definition.kind,
    enabled: definition.enabled,
    revision: definition.revision,
    graph,
    mailboxIds: graphMailboxIds(graph),
    sources: sourceStates(definition, graph, triggers),
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
  };
}

async function summarize(
  definition: DefinitionRow,
  graph: WorkflowGraph,
): Promise<WorkflowSummary> {
  const triggers = await listNewMailTriggers([definition.id]);
  return toSummary(definition, graph, triggers);
}

function resourceLinks(graph: WorkflowGraph, scope: WorkspaceScope): Record<string, string | null> {
  const links = new Map(scope.mailboxes.map((m) => [m.mailboxId, m.linkId]));
  const out: Record<string, string | null> = {};
  for (const node of graph.nodes) {
    const mailboxId =
      node.kind === "mailbox.source"
        ? node.mailboxId
        : node.kind === "trigger.beforeSend"
          ? node.mailboxId
          : null;
    if (!mailboxId) continue;
    out[node.id] = links.get(mailboxId) ?? null;
  }
  return out;
}

export function parseWorkflowInput(raw: unknown): WorkflowDefinitionInput | string {
  const parsed = workflowDefinitionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "This workflow is incomplete.";
  }
  return parsed.data;
}

export function checkGraph(graph: WorkflowGraph, scope: WorkspaceScope): string | null {
  return firstError(
    validateGraph(graph, {
      kind: "user",
      allowedMailboxIds: scope.mailboxes.map((m) => m.mailboxId),
      aiMailboxIds: scope.mailboxes.filter((m) => m.aiEnabled).map((m) => m.mailboxId),
      allowDecisionNodes: decisionEnabled("workflowNode"),
    }),
  );
}

function visibleTo(
  scope: WorkspaceScope,
  definition: DefinitionRow,
  graph: WorkflowGraph,
): boolean {
  if (definition.principalUserId === scope.userId) return true;
  const allowed = new Set(scope.mailboxes.map((m) => m.mailboxId));
  return graphMailboxIds(graph).every((id) => allowed.has(id));
}

export async function listWorkspaceWorkflows(scope: WorkspaceScope): Promise<WorkflowSummary[]> {
  const rows = await listDefinitions({
    workspaceId: scope.workspaceId,
    kind: "user",
  });
  const visible = rows.filter((row) => visibleTo(scope, row.definition, row.graph));
  const triggers = await listNewMailTriggers(visible.map((row) => row.definition.id));
  return visible.map((row) =>
    toSummary(
      row.definition,
      row.graph,
      triggers.filter((t) => t.workflowId === row.definition.id),
    ),
  );
}

export async function getWorkspaceWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
): Promise<WorkflowSummary | null> {
  const loaded = await loadDefinition(workflowId);
  if (!loaded) return null;
  const { definition } = loaded;
  if (
    definition.kind !== "user" ||
    definition.workspaceId !== scope.workspaceId ||
    definition.deletedAt ||
    !visibleTo(scope, definition, loaded.graph)
  ) {
    return null;
  }
  return summarize(definition, loaded.graph);
}

export async function createUserWorkflow(
  scope: WorkspaceScope,
  raw: unknown,
): Promise<WorkflowSummary | string> {
  const parsed = parseWorkflowInput(raw);
  if (typeof parsed === "string") return parsed;

  const invalid = checkGraph(parsed.graph, scope);
  if (invalid) return invalid;

  const saved = await saveDefinition({
    kind: "user",
    workspaceId: scope.workspaceId,
    principalUserId: scope.userId,
    name: parsed.name,
    enabled: parsed.enabled,
    graph: parsed.graph,
    resourceLinks: resourceLinks(parsed.graph, scope),
  });
  return summarize(saved.definition, saved.graph);
}

export async function updateUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
  raw: unknown,
): Promise<WorkflowSummary | string> {
  const existing = await getWorkspaceWorkflow(scope, workflowId);
  if (!existing) return `No workflow "${workflowId}" in this workspace`;

  const parsed = parseWorkflowInput(raw);
  if (typeof parsed === "string") return parsed;

  const invalid = checkGraph(parsed.graph, scope);
  if (invalid) return invalid;

  const revised = await reviseDefinition({
    workflowId,
    name: parsed.name,
    enabled: parsed.enabled,
    graph: parsed.graph,
    resourceLinks: resourceLinks(parsed.graph, scope),
  });
  if (!revised) return `No workflow "${workflowId}" in this workspace`;
  return summarize(revised.definition, revised.graph);
}

export async function toggleUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
  enabled: boolean,
): Promise<boolean> {
  const existing = await getWorkspaceWorkflow(scope, workflowId);
  if (!existing) return false;
  return setDefinitionEnabled(workflowId, enabled);
}

export async function deleteUserWorkflow(
  scope: WorkspaceScope,
  workflowId: string,
): Promise<boolean> {
  const existing = await getWorkspaceWorkflow(scope, workflowId);
  if (!existing) return false;
  return softDeleteDefinition(workflowId);
}

export async function requestWorkflowRun(
  scope: WorkspaceScope,
  workflowId: string,
): Promise<{ runId: string } | string> {
  const loaded = await loadDefinition(workflowId);
  const missing = `No workflow "${workflowId}" in this workspace`;
  if (!loaded) return missing;
  if (
    loaded.definition.kind !== "user" ||
    loaded.definition.workspaceId !== scope.workspaceId ||
    loaded.definition.deletedAt ||
    !visibleTo(scope, loaded.definition, loaded.graph)
  ) {
    return missing;
  }

  const triggers = (await listTriggers(workflowId)).filter((t) => t.armed);
  const manual =
    triggers.find((t) => t.kind === "trigger.manual") ??
    triggers.find((t) => t.kind === "trigger.schedule");
  if (!manual) {
    return "Add a manual or scheduled trigger before running this workflow";
  }

  const runId = await requestManualRun({
    definition: loaded.definition,
    revisionId: loaded.revisionId,
    trigger: manual,
    requestedByUserId: scope.userId,
  });
  if (!runId) return "That run is already queued";
  return { runId };
}

function canSeeRun(
  scope: WorkspaceScope,
  principalUserId: string | null,
  graph: WorkflowGraph,
): boolean {
  if (principalUserId === scope.userId) return true;
  const allowed = new Set(scope.mailboxes.map((m) => m.mailboxId));
  return graphMailboxIds(graph).every((id) => allowed.has(id));
}

const ADDRESS = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;

function maskAddresses(text: string | null | undefined, visible: Set<string>): string | null {
  if (!text) return null;
  return text.replace(ADDRESS, (address) =>
    visible.has(address.toLowerCase()) ? address : "[hidden address]",
  );
}

function lineRedactor(
  scope: WorkspaceScope,
  graph: WorkflowGraph,
  concealedNodes: Set<string> = new Set(),
) {
  const accessible = new Set(scope.mailboxes.map((m) => m.mailboxId));
  const visible = new Set(scope.mailboxes.map((m) => m.email.toLowerCase()));
  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  return (line: RunSummaryLine): string | null => {
    if (!line.detail || concealedNodes.has(line.nodeId)) return null;
    const owner = byNode.get(line.nodeId);
    const own = owner ? nodeMailboxId(owner) : null;
    if (own !== null && !accessible.has(own)) return null;
    const masked = maskAddresses(line.detail, visible);
    return masked === line.detail ? masked : null;
  };
}

function redactGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.kind !== "mailbox.source") return node;
      const { messageId, threadId, query, ...rest } = node;
      return rest;
    }),
  };
}

function mailboxOfKey(key: string, mailboxIds: string[]): string | null {
  return mailboxIds.find((id) => key.includes(`:${id}:`)) ?? null;
}

function carriedOutputs(
  node: WorkflowNode,
  graph: WorkflowGraph,
  nodeRuns: {
    nodeId: string;
    inputKey: string;
    status: NodeStatus;
    outputHandles: string[] | null;
  }[],
): { handle: WorkflowEdge["sourceHandle"]; carried: boolean }[] {
  const taken = new Set(
    nodeRuns
      .filter(
        (nodeRun) =>
          nodeRun.nodeId === node.id &&
          nodeRun.inputKey !== BARRIER_INPUT_KEY &&
          nodeRun.status === "completed",
      )
      .flatMap((nodeRun) => nodeRun.outputHandles ?? []),
  );
  return [
    ...new Set(
      graph.edges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle),
    ),
  ].map((handle) => ({ handle, carried: taken.has(handle) }));
}

function messagesIn(output: NodeRunOutput | null): [string, { subject: string; from: string }][] {
  const found: [string, { subject: string; from: string }][] = [];
  for (const out of output?.outputs ?? []) {
    for (const envelope of out.envelopes) {
      if (envelope.port !== "message" || !envelope.key) continue;
      const { subject, from, fromName } = envelope.message;
      if (!subject && !from) continue;
      found.push([
        envelope.key,
        { subject: subject || "(no subject)", from: fromName || from || "" },
      ]);
    }
  }
  return found;
}

function barrierInputs(
  output: NodeRunOutput | null,
): { port: number; state: string; count: number }[] | null {
  return output?.inputs ?? null;
}

export async function getWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunDetail | null> {
  const row = await loadRunDetail(runId);
  if (!row) return null;
  const { run, graph } = row;
  if (
    run.kind !== "user" ||
    run.workspaceId !== scope.workspaceId ||
    !canSeeRun(scope, row.workflowPrincipalUserId, graph)
  ) {
    return null;
  }

  const accessible = new Map(scope.mailboxes.map((m) => [m.mailboxId, m]));
  const visible = new Set(scope.mailboxes.map((m) => m.email.toLowerCase()));
  const mask = (text: string | null | undefined) => maskAddresses(text, visible);
  const mailboxIds = graphMailboxIds(graph);
  const hidden = (mailboxId: string | null) => mailboxId !== null && !accessible.has(mailboxId);

  const input = run.input;
  const requester = input.kind === "manual" ? input.requestedByUserId : null;
  const people = await listMemberIdentities(
    scope.workspaceId,
    [row.workflowPrincipalUserId, requester].filter((id): id is string => !!id),
  );

  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  const validation = validateGraph(graph, { kind: "user" });
  const order = validation.ok
    ? [
        ...validation.order,
        ...graph.nodes.map((node) => node.id).filter((id) => !validation.order.includes(id)),
      ]
    : graph.nodes.map((node) => node.id);

  const itemMailbox = (nodeRun: (typeof row.nodeRuns)[number]) => {
    if (nodeRun.inputKey === BARRIER_INPUT_KEY) return null;
    const node = byNode.get(nodeRun.nodeId);
    return mailboxOfKey(nodeRun.inputKey, mailboxIds) ?? (node ? nodeMailboxId(node) : null);
  };
  const concealed = new Set(
    row.nodeRuns.filter((nodeRun) => hidden(itemMailbox(nodeRun))).map((nodeRun) => nodeRun.nodeId),
  );
  const messages = new Map<string, { subject: string; from: string }>();
  for (const nodeRun of row.nodeRuns) {
    for (const [key, facts] of messagesIn(nodeRun.output)) {
      if (!messages.has(key)) messages.set(key, facts);
    }
  }
  const lines = run.summary ?? [];
  const lineDetail = lineRedactor(scope, graph, concealed);
  const nodes: WorkflowRunNode[] = order.flatMap((nodeId) => {
    const node = byNode.get(nodeId);
    if (!node) return [];
    const own = nodeMailboxId(node);
    const items = row.nodeRuns
      .filter((nodeRun) => nodeRun.nodeId === nodeId)
      .map((nodeRun): WorkflowRunItem => {
        const mailboxId = itemMailbox(nodeRun);
        const conceal = hidden(mailboxId);
        const stored = nodeRun.output;
        return {
          id: nodeRun.id,
          mailboxId,
          status: nodeRun.status,
          attempts: nodeRun.attempts,
          startedAt: nodeRun.startedAt?.toISOString() ?? null,
          finishedAt: nodeRun.finishedAt?.toISOString() ?? null,
          detail: conceal || typeof stored?.detail !== "string" ? null : mask(stored.detail),
          error: conceal ? null : mask(nodeRun.error),
          operation: nodeRun.receipt?.operation ?? null,
          message: conceal
            ? null
            : (nodeRun.receipt?.message ?? messages.get(nodeRun.inputKey) ?? null),
          decision: conceal ? null : (nodeRun.receipt?.decision ?? null),
          outputs: conceal ? null : nodeRun.outputHandles,
          inputs: nodeRun.inputKey === BARRIER_INPUT_KEY ? barrierInputs(nodeRun.output) : null,
        };
      });
    const nodeLines = lines
      .filter((line) => line.nodeId === nodeId)
      .map((line) => ({
        status: line.status,
        count: line.count,
        detail: lineDetail(line),
      }));
    return [
      {
        nodeId,
        kind: node.kind,
        mailboxId: own,
        reached: nodeId === input.triggerNodeId || nodeLines.length > 0 || items.length > 0,
        lines: nodeLines,
        items,
        outputs: carriedOutputs(node, graph, row.nodeRuns).map((output) => ({
          ...output,
          carried: concealed.has(nodeId) || hidden(own) ? null : output.carried,
        })),
      },
    ];
  });

  const principal = row.workflowPrincipalUserId
    ? (people.get(row.workflowPrincipalUserId) ?? null)
    : null;

  return {
    id: run.id,
    workflowId: run.workflowId,
    workflowName: row.workflowName,
    status: run.status,
    dueAt: run.dueAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    attempts: run.attempts,
    error: mask(run.error),
    steps: lines.map((line) => ({
      ...line,
      detail: lineDetail(line) ?? undefined,
    })),
    revision: row.revision,
    revisionCreatedAt: row.revisionCreatedAt.toISOString(),
    currentRevision: row.deletedAt ? null : row.currentRevision,
    principal,
    trigger: {
      nodeId: input.triggerNodeId,
      kind: byNode.get(input.triggerNodeId)?.kind ?? null,
      source: input.kind,
      scheduledFor: row.scheduledFor.toISOString(),
      firedFor: input.kind === "schedule" || input.kind === "once" ? input.firedFor : null,
      missed: input.kind === "schedule" ? input.missed : 0,
      messageCount:
        input.kind === "newMail"
          ? input.messages.length
          : input.kind === "manual"
            ? (input.messages?.length ?? null)
            : null,
      requestedBy: requester ? (people.get(requester) ?? null) : null,
    },
    mailboxes: mailboxIds.map((mailboxId) => ({
      mailboxId,
      email: accessible.get(mailboxId)?.email ?? null,
    })),
    graph: redactGraph(graph),
    nodes,
  };
}

export type WorkflowRunCancellation = RunCancelResult & { message: string };

const needsReview = (n: number) =>
  n > 0 ? ` ${n} step(s) from an earlier attempt have an unconfirmed outcome and need review.` : "";

function describeCancel(result: RunCancelResult): string {
  if (result.state === "cancelled") {
    return `Cancelled — no further steps of this run will start.${needsReview(result.unresolved)}`;
  }
  if (result.state === "stopping") {
    return result.inFlight > 0
      ? `Cancellation recorded — the run stops before its next step. ${result.inFlight} step(s) already in progress cannot be called back and may still complete; anything already sent or changed at the provider is not undone.`
      : "Cancellation recorded — the run stops before its next step. Anything it already did at the provider is not undone.";
  }
  if (result.status === "cancelled") return "This run was already cancelled.";
  return `This run already finished (${result.status}) — there is nothing left to cancel.`;
}

export async function cancelWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunCancellation | null> {
  const row = await loadRunScope(runId);
  if (
    row?.kind !== "user" ||
    row.workspaceId !== scope.workspaceId ||
    !canSeeRun(scope, row.principalUserId, row.graph)
  ) {
    return null;
  }
  const result = await cancelRun(runId);
  return { ...result, message: describeCancel(result) };
}

export type WorkflowRunResume = RunResume;

export async function resumeWorkspaceRun(
  scope: WorkspaceScope,
  runId: string,
): Promise<WorkflowRunResume | null> {
  const row = await loadRunScope(runId);
  if (
    row?.kind !== "user" ||
    row.workspaceId !== scope.workspaceId ||
    !canSeeRun(scope, row.principalUserId, row.graph)
  ) {
    return null;
  }
  return resumeCheckedRun(runId);
}

export async function listWorkspaceRuns(opts: {
  scope: WorkspaceScope;
  workflowId?: string;
  limit: number;
}): Promise<WorkflowRunSummary[]> {
  const rows = await listRuns({
    workspaceId: opts.scope.workspaceId,
    workflowId: opts.workflowId,
    kind: "user",
    limit: opts.limit,
  });

  const visible = new Set(opts.scope.mailboxes.map((m) => m.email.toLowerCase()));
  return rows
    .filter((row) => canSeeRun(opts.scope, row.principalUserId, row.graph))
    .map((row) => {
      const lineDetail = lineRedactor(opts.scope, row.graph);
      return {
        id: row.id,
        workflowId: row.workflowId,
        workflowName: row.workflowName,
        status: row.status,
        dueAt: row.dueAt.toISOString(),
        startedAt: row.startedAt?.toISOString() ?? null,
        finishedAt: row.finishedAt?.toISOString() ?? null,
        attempts: row.attempts,
        error: maskAddresses(row.error, visible),
        steps: (row.summary ?? []).map((line) => ({
          ...line,
          detail: lineDetail(line) ?? undefined,
        })),
      };
    });
}
