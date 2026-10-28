import { expect } from "vitest";

import type { Account } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { until } from "./poll";
import { mailboxScope, scope } from "./session";

export const SETTLED = ["completed", "failed", "partial", "blocked", "cancelled"];

export type Binding = { kind: "literal"; value: unknown } | { kind: "expr"; cel: string };

export interface GraphNode {
  id: string;
  step: string;
  title?: string;
  skip?: boolean;
  onError?: string;
  position: { x: number; y: number };
  params: Record<string, Binding>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle?: string;
}

export interface Graph {
  version: 2;
  nodes: GraphNode[];
  edges: GraphEdge[];
  settings: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  revision: number;
  graph: Graph;
  endpoints: { triggerNodeId: string; endpointId: string; url: string | null }[];
}

export const lit = (value: unknown): Binding => ({ kind: "literal", value });
export const cel = (text: string): Binding => ({ kind: "expr", cel: text });

export const at = (step: number, lane = 0) => ({ x: step * 352, y: lane * 200 });

export function node(
  id: string,
  step: string,
  position: { x: number; y: number },
  params: Record<string, Binding> = {},
  extra: Partial<GraphNode> = {},
): GraphNode {
  return { id, step, position, params, ...extra };
}

export function edge(
  source: string,
  target: string,
  sourceHandle = "out",
  targetHandle?: string,
): GraphEdge {
  return {
    id: `${source}:${sourceHandle}->${target}${targetHandle ? `:${targetHandle}` : ""}`,
    source,
    target,
    sourceHandle,
    ...(targetHandle ? { targetHandle } : {}),
  };
}

export function graphOf(
  nodes: GraphNode[],
  edges: GraphEdge[],
  settings: Record<string, unknown> = {},
): Graph {
  return { version: 2, nodes, edges, settings };
}

export interface RunItem {
  id: string;
  status: string;
}

export interface RunNode {
  nodeId: string;
  step: string;
  reached: boolean;
  items: RunItem[];
}

export interface RunDetail {
  id: string;
  status: string;
  error: string | null;
  finishedAt: string | null;
  nodes: RunNode[];
}

export async function workflowNamed(rpc: Rpc, account: Account, name: string): Promise<Workflow> {
  const { workflows } = await rpc<{ workflows: Workflow[] }>("workflows.list", scope(account));
  const found = workflows.find((w) => w.name === name);
  if (!found) throw new Error(`workflow "${name}" is not seeded`);
  return found;
}

export async function getRun(rpc: Rpc, account: Account, runId: string): Promise<RunDetail> {
  return (
    await rpc<{ run: RunDetail }>("workflows.getRun", {
      ...scope(account),
      runId,
    })
  ).run;
}

export async function settledStatus(rpc: Rpc, account: Account, runId: string): Promise<string> {
  return (
    await until(
      () => getRun(rpc, account, runId),
      (run) => SETTLED.includes(run.status),
      { what: `run ${runId} to settle` },
    )
  ).status;
}

export async function waitForRun(
  rpc: Rpc,
  account: Account,
  runId: string,
  timeout = 60_000,
): Promise<RunDetail> {
  try {
    return await until(
      () => getRun(rpc, account, runId),
      (run) => SETTLED.includes(run.status),
      { timeout, what: `run ${runId} to settle` },
    );
  } catch (unsettled) {
    await rpc("workflows.cancelRun", { ...scope(account), runId });
    await until(
      () => getRun(rpc, account, runId),
      (run) => run.finishedAt !== null,
      { timeout: 30_000, what: `cancelled run ${runId} to finish` },
    );
    throw unsettled;
  }
}

export async function runWorkflow(
  rpc: Rpc,
  account: Account,
  name: string,
  timeout?: number,
): Promise<RunDetail> {
  const workflow = await workflowNamed(rpc, account, name);
  const { runId } = await rpc<{ runId: string }>("workflows.run", {
    ...scope(account),
    id: workflow.id,
  });
  return waitForRun(rpc, account, runId, timeout);
}

export function nodeOf(run: RunDetail, nodeId: string): RunNode {
  const found = run.nodes.find((n) => n.nodeId === nodeId);
  if (!found) throw new Error(`run ${run.id} has no step ${nodeId}`);
  return found;
}

export type LabelMap = Record<string, { label: string }>;

export async function labelMap(rpc: Rpc, account: Account): Promise<LabelMap> {
  const { labels } = await rpc<{ labels: LabelMap }>("mail.labels.getMap", mailboxScope(account));
  return labels;
}

export async function restoreLabels(rpc: Rpc, account: Account, before: LabelMap): Promise<void> {
  const mailbox = mailboxScope(account);
  const after = await labelMap(rpc, account);
  const cleared: string[] = [];
  for (const [id, info] of Object.entries(after)) {
    if (before[id]?.label !== info.label) {
      await rpc("mail.labels.clearOnMessage", { ...mailbox, id });
      if (before[id]) cleared.push(id);
    }
  }
  if (cleared.length > 0) {
    const { emails } = await rpc<{
      emails: {
        id: string;
        from: string;
        fromName?: string;
        subject: string;
        snippet: string;
      }[];
    }>("mail.messages.list", { ...mailbox, folder: "inbox", limit: 100 });
    await rpc("mail.labels.classify", {
      ...mailbox,
      items: emails
        .filter((e) => cleared.includes(e.id))
        .map((e) => ({
          id: e.id,
          sender: e.fromName || e.from,
          subject: e.subject,
          snippet: e.snippet,
        })),
    });
  }
  const restored = await labelMap(rpc, account);
  for (const [id, info] of Object.entries(before)) {
    expect(restored[id]?.label, id).toBe(info.label);
  }
}
