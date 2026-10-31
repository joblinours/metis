import { expect } from "@playwright/test";

import type { Rpc } from "./fixtures";
import type { Account } from "./harness";

export const SETTLED = ["completed", "failed", "partial", "blocked", "cancelled"];

export async function settled(status: () => Promise<string>, timeout = 60_000) {
  await expect
    .poll(async () => SETTLED.includes(await status()), {
      timeout,
      intervals: [1_000],
    })
    .toBe(true);
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  graph: {
    version: 2;
    nodes: {
      id: string;
      step: string;
      title?: string;
      skip?: boolean;
      position: { x: number; y: number };
      params: Record<string, { kind: string; value?: unknown; cel?: string; text?: string }>;
    }[];
    edges: {
      id: string;
      source: string;
      target: string;
      sourceHandle: string;
      targetHandle?: string;
    }[];
    settings: Record<string, unknown>;
  };
}

export interface RunItem {
  id: string;
  itemKey: string;
  status: string;
  error: string | null;
  decision: { handle: string } | null;
  inputs: { port: number; state: string; count: number }[] | null;
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

export function workspace(account: Account) {
  return { workspaceSlug: account.workspaceSlug };
}

export async function workflowNamed(rpc: Rpc, account: Account, name: string): Promise<Workflow> {
  const { workflows } = await rpc<{ workflows: Workflow[] }>("workflows.list", workspace(account));
  const found = workflows.find((w) => w.name === name);
  if (!found) throw new Error(`workflow "${name}" is not seeded`);
  return found;
}

export async function getRun(rpc: Rpc, account: Account, runId: string): Promise<RunDetail> {
  return (
    await rpc<{ run: RunDetail }>("workflows.getRun", {
      ...workspace(account),
      runId,
    })
  ).run;
}

export async function waitForRun(
  rpc: Rpc,
  account: Account,
  runId: string,
  timeout?: number,
): Promise<RunDetail> {
  try {
    await settled(async () => (await getRun(rpc, account, runId)).status, timeout);
  } catch (unsettled) {
    await rpc("workflows.cancelRun", { ...workspace(account), runId });
    await expect
      .poll(async () => (await getRun(rpc, account, runId)).finishedAt, {
        timeout: 30_000,
        intervals: [1_000],
      })
      .not.toBeNull();
    throw unsettled;
  }
  return getRun(rpc, account, runId);
}

export async function runWorkflow(
  rpc: Rpc,
  account: Account,
  name: string,
  timeout?: number,
): Promise<RunDetail> {
  const workflow = await workflowNamed(rpc, account, name);
  const { runId } = await rpc<{ runId: string }>("workflows.run", {
    ...workspace(account),
    id: workflow.id,
  });
  return waitForRun(rpc, account, runId, timeout);
}

export function nodeOf(run: RunDetail, nodeId: string): RunNode {
  const node = run.nodes.find((n) => n.nodeId === nodeId);
  if (!node) throw new Error(`run ${run.id} has no step ${nodeId}`);
  return node;
}

export async function starredIds(rpc: Rpc, account: Account): Promise<Set<string>> {
  const { emails } = await rpc<{ emails: { id: string; isStarred: boolean }[] }>(
    "mail.messages.list",
    { ...workspace(account), mailboxSlug: account.mailboxSlug, folder: "inbox", limit: 100 },
  );
  return new Set(emails.filter((e) => e.isStarred).map((e) => e.id));
}

export async function restoreStars(rpc: Rpc, account: Account, before: Set<string>): Promise<void> {
  const mailbox = { ...workspace(account), mailboxSlug: account.mailboxSlug };
  const after = await starredIds(rpc, account);
  for (const id of after) {
    if (!before.has(id)) await rpc("mail.messages.star", { ...mailbox, id, starred: false });
  }
  for (const id of before) {
    if (!after.has(id)) await rpc("mail.messages.star", { ...mailbox, id, starred: true });
  }
  expect([...(await starredIds(rpc, account))].toSorted()).toEqual([...before].toSorted());
}
