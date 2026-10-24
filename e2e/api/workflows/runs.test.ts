import { env } from "@metis/e2e/lib/env";
import {
  appendLateArrival,
  deleteLateArrival,
  LATE_ARRIVAL_SUBJECT,
  LATE_ARRIVAL_WORKFLOW,
} from "@metis/e2e/lib/late-arrival";
import { ImapFlow } from "imapflow";
import { expect, test } from "vitest";

import { harness } from "../../clients/harness";
import { until } from "../support/poll";
import { ana, mailboxScope, scope } from "../support/session";
import {
  getRun,
  labelMap,
  nodeOf,
  restoreLabels,
  SETTLED,
  settledStatus,
  waitForRun,
  workflowNamed,
} from "../support/workflow";

const TRIAGE = "Triage with the decision model";

async function hitsDuring(path: string, run: () => Promise<void>): Promise<number> {
  const before = (await harness.hits()).length;
  await run();
  return (await harness.hits()).slice(before).filter((h) => h.path === path).length;
}

async function withImap<T>(run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: env.imap.host,
    port: env.imap.port,
    secure: false,
    auth: { user: env.imap.user, pass: env.imap.pass },
    logger: false,
  });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.logout();
  }
}

test(
  "retrying a run whose Ask completed and a later step failed does not ask again",
  async () => {
    const { rpc, account } = await ana();
    const before = await labelMap(rpc, account);
    const mailbox = mailboxScope(account);
    const [newest] = (
      await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
        ...mailbox,
        folder: "inbox",
        limit: 1,
      })
    ).emails;
    if (!newest) throw new Error("the inbox is empty");
    const triage = await workflowNamed(rpc, account, TRIAGE);
    const original = triage.graph;
    const failing = {
      ...original,
      nodes: [
        ...original.nodes.map((n) =>
          n.id === "todo"
            ? {
                id: n.id,
                kind: "action.archive",
                position: n.position,
              }
            : n.id === "inbox"
              ? { ...n, limit: 1 }
              : n,
        ),
        { id: "every", kind: "merge.append", position: { x: 0, y: 600 } },
      ],
      edges: [
        ...original.edges.filter((e) => !(e.source === "act" && e.target === "todo")),
        ...["yes", "no", "unsure"].map((handle, index) => ({
          id: `act-${handle}-every`,
          source: "act",
          sourceHandle: handle,
          target: "every",
          targetHandle: `in:${index}`,
        })),
        {
          id: "every-todo",
          source: "every",
          sourceHandle: "out",
          target: "todo",
        },
      ],
    };
    await rpc("workflows.update", {
      ...scope(account),
      id: triage.id,
      workflow: { name: triage.name, enabled: triage.enabled, graph: failing },
    });
    await withImap((client) => client.mailboxDelete("Archive"));
    try {
      const { runId } = await rpc<{ runId: string }>("workflows.run", {
        ...scope(account),
        id: triage.id,
      });
      const run = await until(
        () => getRun(rpc, account, runId),
        (r) =>
          JSON.stringify(nodeOf(r, "todo").items.map((i) => i.status)) ===
          JSON.stringify(["failed"]),
        { timeout: 60_000, what: "the archive step to fail" },
      );
      expect(SETTLED).not.toContain(run.status);
      expect(nodeOf(run, "ask").items).toHaveLength(1);
      expect(nodeOf(run, "ask").items.every((i) => i.status === "completed")).toBe(true);

      const decisions = await hitsDuring("/systemone", async () => {
        await withImap((client) => client.mailboxCreate("Archive"));
        const done = await waitForRun(rpc, account, runId);
        expect(done.status).toBe("completed");
      });
      expect(decisions).toBe(0);
    } finally {
      await withImap(async (client) => {
        const boxes = (await client.list()).map((b) => b.path);
        if (!boxes.includes("Archive")) await client.mailboxCreate("Archive");
      });
      const listed = async (folder: string) =>
        (
          await rpc<{ emails: { id: string; subject: string }[] }>("mail.messages.list", {
            ...mailbox,
            folder,
            limit: 100,
          })
        ).emails.find((e) => e.subject === newest.subject);
      const archived = await listed("archive");
      if (archived) {
        await rpc("mail.messages.restore", { ...mailbox, id: archived.id });
        const restored = await listed("inbox");
        const label = before[newest.id];
        if (restored && label && restored.id !== newest.id) {
          before[restored.id] = label;
          delete before[newest.id];
        }
      }
      await withImap(async (client) => {
        const lock = await client.getMailboxLock("Archive");
        try {
          const all = await client.search({ all: true }, { uid: true });
          if (all && all.length > 0) await client.messageMove(all, "INBOX", { uid: true });
        } finally {
          lock.release();
        }
      });
      await rpc("workflows.update", {
        ...scope(account),
        id: triage.id,
        workflow: {
          name: triage.name,
          enabled: triage.enabled,
          graph: original,
        },
      });
      await restoreLabels(rpc, account, before);
    }
  },
  4 * 60_000,
);

test(
  "new mail runs through a decision step",
  async () => {
    const { rpc, account } = await ana();
    const workflow = await workflowNamed(rpc, account, LATE_ARRIVAL_WORKFLOW);
    expect(workflow.enabled).toBe(false);
    const before = await labelMap(rpc, account);
    await rpc("workflows.toggle", {
      ...scope(account),
      id: workflow.id,
      enabled: true,
    });
    try {
      await until(
        async () => {
          const { workflows } = await rpc<{
            workflows: { id: string; sources: { baselined: boolean }[] }[];
          }>("workflows.list", scope(account));
          return workflows.find((w) => w.id === workflow.id)?.sources ?? [];
        },
        (sources) => sources.length > 0 && sources.every((s) => s.baselined),
        { timeout: 60_000, what: "the new-mail trigger to baseline" },
      );
      const runsOf = async () =>
        (
          await rpc<{ runs: { id: string; status: string }[] }>("workflows.runs", {
            ...scope(account),
            workflowId: workflow.id,
          })
        ).runs;
      const earlier = new Set((await runsOf()).map((r) => r.id));
      await appendLateArrival(env.imap);
      const runs = await until(
        runsOf,
        (list) => list.some((r) => !earlier.has(r.id) && SETTLED.includes(r.status)),
        { timeout: 120_000, interval: 2_000, what: "a settled new-mail run" },
      );
      const runId = runs.find((r) => !earlier.has(r.id) && SETTLED.includes(r.status))?.id ?? "";
      const run = await getRun(rpc, account, runId);
      expect(run.status).toBe("completed");
      const routed = ["todo", "fyi"].filter((id) => nodeOf(run, id).items.length > 0);
      expect(routed).toHaveLength(1);
      const [labelNode] = routed;
      const expected = labelNode === "todo" ? "action_required" : "updates";
      const { emails } = await rpc<{
        emails: { id: string; subject: string }[];
      }>("mail.messages.list", {
        ...mailboxScope(account),
        folder: "inbox",
        limit: 20,
      });
      const arrived = emails.find((e) => e.subject === LATE_ARRIVAL_SUBJECT);
      expect(arrived).toBeDefined();
      expect((await labelMap(rpc, account))[arrived?.id ?? ""]?.label).toBe(expected);
    } finally {
      await deleteLateArrival(env.imap);
      await rpc("workflows.toggle", {
        ...scope(account),
        id: workflow.id,
        enabled: false,
      });
      await restoreLabels(rpc, account, before);
    }
  },
  4 * 60_000,
);

test("request a run and cancel it, and the reported outcome matches the run", async () => {
  const { rpc, account } = await ana();
  const before = await labelMap(rpc, account);
  try {
    const workflow = await workflowNamed(rpc, account, "Label rebrand mail");
    const { runId } = await rpc<{ runId: string }>("workflows.run", {
      ...scope(account),
      id: workflow.id,
    });
    const outcome = await rpc<{
      state: string;
      status?: string;
      message: string;
    }>("workflows.cancelRun", { ...scope(account), runId });
    expect(outcome.message).toBeTruthy();
    const status = await settledStatus(rpc, account, runId);
    const allowed =
      outcome.state === "finished"
        ? [outcome.status]
        : outcome.state === "stopping"
          ? ["cancelled", "completed"]
          : ["cancelled"];
    expect(allowed).toContain(status);
  } finally {
    await restoreLabels(rpc, account, before);
  }
});
