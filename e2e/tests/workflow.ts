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
    nodes: { id: string; kind: string; label?: string }[];
    edges: unknown[];
  };
}

export interface RunItem {
  id: string;
  status: string;
  error: string | null;
  decision: { handle: string } | null;
  inputs: { port: number; state: string; count: number }[] | null;
}

export interface RunNode {
  nodeId: string;
  kind: string;
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

export type LabelMap = Record<string, { label: string }>;

export async function labelMap(rpc: Rpc, account: Account): Promise<LabelMap> {
  const { labels } = await rpc<{ labels: LabelMap }>("mail.labels.getMap", {
    ...workspace(account),
    mailboxSlug: account.mailboxSlug,
  });
  return labels;
}

export async function restoreLabels(rpc: Rpc, account: Account, before: LabelMap): Promise<void> {
  const mailbox = { ...workspace(account), mailboxSlug: account.mailboxSlug };
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
