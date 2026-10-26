import { expect, test } from "vitest";

import type { Account } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";
import { until, uniqueName } from "../support/poll";
import { ana, mailboxScope, scope } from "../support/session";
import { getRun, labelMap, nodeOf, restoreLabels, SETTLED, waitForRun } from "../support/workflow";

interface Mailbox {
  mailboxId: string;
  slug: string;
  email: string;
}

interface Email {
  id: string;
  subject: string;
  from: string;
  isStarred: boolean;
}

interface TestResult {
  status: string;
  error: string | null;
  sample: { subject: string; from: string } | null;
  steps: { nodeId: string; status: string; count: number; detail: string | null }[];
  items: {
    nodeId: string;
    status: string;
    subject: string | null;
    from: string | null;
    outputs: string[];
    detail: string | null;
    error: string | null;
  }[];
}

type Node = Record<string, unknown> & { id: string; kind: string };
type Edge = { id: string; source: string; target: string; sourceHandle?: string };

const at = (step: number, lane = 0) => ({ x: step * 352, y: lane * 200 });

function edge(source: string, target: string, sourceHandle = "out"): Edge {
  return { id: `${source}:${sourceHandle}->${target}`, source, target, sourceHandle };
}

function inbox(mailboxId: string, step = 1): Node {
  return {
    id: "inbox",
    kind: "mailbox.source",
    position: at(step),
    mailboxId,
    operation: "list",
    folder: "inbox",
    limit: 50,
  };
}

function subjectContains(id: string, value: string, step = 2): Node {
  return {
    id,
    kind: "condition",
    position: at(step),
    predicate: { kind: "predicate", field: "subject", op: "contains", value },
  };
}

function manualGraph(mailboxId: string, tail: Node[], tailEdges: Edge[]) {
  return {
    nodes: [{ id: "manual", kind: "trigger.manual", position: at(0) }, inbox(mailboxId), ...tail],
    edges: [edge("manual", "inbox"), ...tailEdges],
  };
}

async function primaryMailbox(rpc: Rpc, account: Account): Promise<Mailbox> {
  const { mailboxes } = await rpc<{ mailboxes: Mailbox[] }>("workflows.list", scope(account));
  const found = mailboxes.find((m) => m.slug === account.mailboxSlug) ?? mailboxes[0];
  if (!found) throw new Error("the workspace has no mailbox");
  return found;
}

async function inboxEmails(rpc: Rpc, account: Account): Promise<Email[]> {
  const { emails } = await rpc<{ emails: Email[] }>("mail.messages.list", {
    ...mailboxScope(account),
    folder: "inbox",
    limit: 50,
  });
  return emails;
}

function bySubject(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

async function rejection(call: Promise<unknown>): Promise<RpcError> {
  const err = await call.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof RpcError)) throw new Error("expected an RpcError");
  return err;
}

async function withWorkflow<T>(
  rpc: Rpc,
  account: Account,
  workflow: { name: string; enabled: boolean; graph: unknown },
  run: (created: { id: string; revision: number; graph: { nodes: Node[] } }) => Promise<T>,
): Promise<T> {
  const { workflow: created } = await rpc<{
    workflow: { id: string; revision: number; graph: { nodes: Node[] } };
  }>("workflows.create", { ...scope(account), workflow });
  try {
    return await run(created);
  } finally {
    await rpc("workflows.delete", { ...scope(account), id: created.id });
  }
}

test("a graph without a trigger is refused with its validation message", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const err = await rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: {
        name: uniqueName(),
        enabled: false,
        graph: { nodes: [inbox(box.mailboxId)], edges: [] },
      },
    }),
  );
  expect(err.status).toBe(400);
  expect(err.message).toBe("Start the workflow with a trigger");
});

test("a skip flag on a step that is not an action is refused", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.mailboxId,
    [{ ...subjectContains("rebrand", "Rebrand"), skip: true }],
    [edge("inbox", "rebrand")],
  );
  const err = await rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: { name: uniqueName(), enabled: false, graph },
    }),
  );
  expect(err.message).toBe("Only an action step can be skipped");
});

test("an unknown time zone and a bad cron expression are refused", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const schedule = (cron: string, timezone: string) => ({
    nodes: [
      { id: "daily", kind: "trigger.schedule", position: at(0), cron, timezone },
      inbox(box.mailboxId),
    ],
    edges: [edge("daily", "inbox")],
  });
  const zone = await rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: { name: uniqueName(), enabled: false, graph: schedule("0 9 * * *", "Mars/Base") },
    }),
  );
  expect(zone.message).toBe('"Mars/Base" is not a known time zone');
  const cron = await rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: { name: uniqueName(), enabled: false, graph: schedule("every day", "Etc/UTC") },
    }),
  );
  expect(cron.message).toBe("Use a five-field cron expression, for example 0 9 * * 1-5");
});

test("a mailbox outside the workspace is refused", async () => {
  const { rpc, account } = await ana();
  const err = await rejection(
    rpc("workflows.create", {
      ...scope(account),
      workflow: {
        name: uniqueName(),
        enabled: false,
        graph: manualGraph("no-such-mailbox", [], []),
      },
    }),
  );
  expect(err.message).toBe("That mailbox is not available in this workspace");
});

test("step titles round-trip through create, list and update, and an update bumps the revision", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.mailboxId,
    [{ ...subjectContains("rebrand", "Rebrand"), title: "Is it about the rebrand?" }],
    [edge("inbox", "rebrand")],
  );
  await withWorkflow(rpc, account, { name: uniqueName(), enabled: false, graph }, async (wf) => {
    const listed = await rpc<{
      workflows: { id: string; revision: number; graph: { nodes: Node[] } }[];
    }>("workflows.list", scope(account));
    const found = listed.workflows.find((w) => w.id === wf.id);
    expect(found?.graph.nodes.find((n) => n.id === "rebrand")?.title).toBe(
      "Is it about the rebrand?",
    );

    const renamed = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "rebrand" ? { ...n, title: "Rebrand mail" } : n)),
    };
    const { workflow: updated } = await rpc<{
      workflow: { revision: number; graph: { nodes: Node[] } };
    }>("workflows.update", {
      ...scope(account),
      id: wf.id,
      workflow: { name: uniqueName(), enabled: false, graph: renamed },
    });
    expect(updated.revision).toBeGreaterThan(wf.revision);
    expect(updated.graph.nodes.find((n) => n.id === "rebrand")?.title).toBe("Rebrand mail");
  });
});

test("a skipped action passes its mail straight on, and the run records the step as skipped", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const before = await labelMap(rpc, account);
  const graph = manualGraph(
    box.mailboxId,
    [
      subjectContains("order", "order"),
      { id: "archive", kind: "action.archive", position: at(3), skip: true },
      { id: "label", kind: "action.label", position: at(4), label: "work" },
    ],
    [edge("inbox", "order"), edge("order", "archive", "matched"), edge("archive", "label")],
  );
  try {
    await withWorkflow(rpc, account, { name: uniqueName(), enabled: true, graph }, async (wf) => {
      const { runId } = await rpc<{ runId: string }>("workflows.run", {
        ...scope(account),
        id: wf.id,
      });
      const run = await waitForRun(rpc, account, runId);
      expect(run.status).toBe("completed");
      const detail = await rpc<{
        run: {
          nodes: { nodeId: string; lines: { status: string; detail: string | null }[] }[];
        };
      }>("workflows.getRun", { ...scope(account), runId });
      const archive = detail.run.nodes.find((n) => n.nodeId === "archive");
      expect(archive?.lines.map((l) => l.status)).toEqual(["skipped"]);
      expect(archive?.lines[0]?.detail).toBe("this step is skipped in the editor");
      expect(nodeOf(run, "label").items.length).toBeGreaterThan(0);

      const order = (await inboxEmails(rpc, account)).find((e) =>
        e.subject.includes("Your order A-42"),
      );
      expect(order, "the skipped archive left the order in the inbox").toBeDefined();
      expect((await labelMap(rpc, account))[order?.id ?? ""]?.label).toBe("work");
    });
  } finally {
    await restoreLabels(rpc, account, before);
  }
});

test("a test run of an unsaved graph reports what each step would do and changes nothing", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const labelsBefore = await labelMap(rpc, account);
  const emailsBefore = await inboxEmails(rpc, account);
  const { runs: runsBefore } = await rpc<{ runs: unknown[] }>("workflows.runs", {
    ...scope(account),
    limit: 100,
  });
  const graph = manualGraph(
    box.mailboxId,
    [
      subjectContains("rebrand", "Rebrand"),
      { id: "label", kind: "action.label", position: at(3), label: "work" },
      { id: "star", kind: "action.star", position: at(4) },
    ],
    [edge("inbox", "rebrand"), edge("rebrand", "label", "matched"), edge("label", "star")],
  );

  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });

  expect(result.status).toBe("completed");
  expect(result.error).toBeNull();
  expect(result.sample).toBeNull();
  const rebrand = emailsBefore.filter((e) => e.subject.includes("Rebrand"));
  expect(rebrand.length).toBeGreaterThan(0);

  const condition = result.items.filter((i) => i.nodeId === "rebrand");
  expect(condition).toHaveLength(emailsBefore.length);
  expect(condition.filter((i) => i.outputs.includes("matched"))).toHaveLength(rebrand.length);
  expect(condition.filter((i) => i.outputs.includes("unmatched"))).toHaveLength(
    emailsBefore.length - rebrand.length,
  );

  for (const id of ["label", "star"]) {
    const items = result.items.filter((i) => i.nodeId === id);
    expect(items.map((i) => i.subject).toSorted(bySubject), id).toEqual(
      rebrand.map((e) => e.subject).toSorted(bySubject),
    );
    for (const item of items) {
      expect(item.status).toBe("completed");
      expect(item.detail).toBe("not applied in a test run");
      expect(item.outputs).toEqual(["out"]);
    }
  }

  expect(await labelMap(rpc, account)).toEqual(labelsBefore);
  const emailsAfter = await inboxEmails(rpc, account);
  expect(emailsAfter.map((e) => [e.id, e.isStarred])).toEqual(
    emailsBefore.map((e) => [e.id, e.isStarred]),
  );
  const { runs: runsAfter } = await rpc<{ runs: unknown[] }>("workflows.runs", {
    ...scope(account),
    limit: 100,
  });
  expect(runsAfter).toHaveLength(runsBefore.length);
});

test("a test run follows a skipped action into the step after it", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const graph = manualGraph(
    box.mailboxId,
    [
      subjectContains("order", "order"),
      { id: "trash", kind: "action.trash", position: at(3), skip: true },
      { id: "label", kind: "action.label", position: at(4), label: "transactions" },
    ],
    [edge("inbox", "order"), edge("order", "trash", "matched"), edge("trash", "label")],
  );
  const result = await rpc<TestResult>("workflows.test", {
    ...scope(account),
    graph,
    triggerNodeId: "manual",
  });
  expect(result.status).toBe("completed");
  const trash = result.items.filter((i) => i.nodeId === "trash");
  expect(trash.length).toBeGreaterThan(0);
  for (const item of trash) expect(item.status).toBe("skipped");
  expect(result.items.filter((i) => i.nodeId === "label").map((i) => i.subject)).toEqual(
    trash.map((i) => i.subject),
  );
});

test("a test run from a new-mail trigger runs on the sample message that was picked", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const { messages } = await rpc<{
    messages: { messageId: string; subject: string; from: string; date: string | null }[];
  }>("workflows.testSamples", { ...scope(account), mailboxId: box.mailboxId });
  const kickoff = messages.find((m) => m.subject === "Rebrand kickoff");
  const order = messages.find((m) => m.subject.includes("Your order A-42"));
  expect(kickoff).toBeDefined();
  expect(order).toBeDefined();

  const graph = {
    nodes: [
      { id: "arrives", kind: "trigger.newMail", position: at(0) },
      { ...inbox(box.mailboxId), operation: "incoming" },
      {
        id: "raj",
        kind: "condition",
        position: at(2),
        predicate: { kind: "predicate", field: "from", op: "contains", value: "raj@" },
      },
      { id: "label", kind: "action.label", position: at(3), label: "work" },
    ],
    edges: [edge("arrives", "inbox"), edge("inbox", "raj"), edge("raj", "label", "matched")],
  };
  const runOn = (messageId: string) =>
    rpc<TestResult>("workflows.test", {
      ...scope(account),
      graph,
      triggerNodeId: "arrives",
      messageId,
    });

  const matched = await runOn(kickoff?.messageId ?? "");
  expect(matched.status).toBe("completed");
  expect(matched.sample?.subject).toBe("Rebrand kickoff");
  expect(matched.items.filter((i) => i.nodeId === "inbox")).toHaveLength(1);
  expect(matched.items.find((i) => i.nodeId === "raj")?.outputs).toEqual(["matched"]);
  expect(matched.items.filter((i) => i.nodeId === "label")).toHaveLength(1);

  const missed = await runOn(order?.messageId ?? "");
  expect(missed.sample?.subject).toContain("Your order A-42");
  expect(missed.items.find((i) => i.nodeId === "raj")?.outputs).toEqual(["unmatched"]);
  expect(missed.items.filter((i) => i.nodeId === "label")).toHaveLength(0);
});

test("a test run refuses an invalid graph, a before-send trigger and an unknown sample", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);

  const noTrigger = await rejection(
    rpc("workflows.test", {
      ...scope(account),
      graph: { nodes: [inbox(box.mailboxId)], edges: [] },
      triggerNodeId: "inbox",
    }),
  );
  expect(noTrigger.message).toBe("Start the workflow with a trigger");

  const beforeSend = await rejection(
    rpc("workflows.test", {
      ...scope(account),
      graph: {
        nodes: [
          { id: "sending", kind: "trigger.beforeSend", position: at(0) },
          { id: "bcc", kind: "action.autoBcc", position: at(1), address: "archive@harness.test" },
        ],
        edges: [edge("sending", "bcc")],
      },
      triggerNodeId: "sending",
    }),
  );
  expect(beforeSend.message).toBe("A test run starts from a new-mail, schedule or manual trigger");

  const unknownSample = await rejection(
    rpc("workflows.test", {
      ...scope(account),
      graph: {
        nodes: [
          { id: "arrives", kind: "trigger.newMail", position: at(0) },
          { ...inbox(box.mailboxId), operation: "incoming" },
        ],
        edges: [edge("arrives", "inbox")],
      },
      triggerNodeId: "arrives",
      messageId: "no-such-message",
    }),
  );
  expect(unknownSample.message).toBe("That message is no longer among the newest in the inbox");

  const samples = await rejection(
    rpc("workflows.testSamples", { ...scope(account), mailboxId: "no-such-mailbox" }),
  );
  expect(samples.message).toBe("That mailbox is not in this workspace");
});

test("a test run validates and runs the graph it is sent, not the saved one", async () => {
  const { rpc, account } = await ana();
  const box = await primaryMailbox(rpc, account);
  const saved = manualGraph(
    box.mailboxId,
    [subjectContains("cond", "Rebrand")],
    [edge("inbox", "cond")],
  );
  await withWorkflow(
    rpc,
    account,
    { name: uniqueName(), enabled: false, graph: saved },
    async () => {
      const edited = manualGraph(
        box.mailboxId,
        [subjectContains("cond", "debited")],
        [edge("inbox", "cond")],
      );
      const result = await rpc<TestResult>("workflows.test", {
        ...scope(account),
        graph: edited,
        triggerNodeId: "manual",
      });
      const matched = result.items.filter(
        (i) => i.nodeId === "cond" && i.outputs.includes("matched"),
      );
      expect(matched.map((i) => i.subject)).toEqual([expect.stringContaining("debited")]);
    },
  );
});

test(
  "a schedule trigger fires on its own and the run reports the schedule as its source",
  async () => {
    const { rpc, account } = await ana();
    const box = await primaryMailbox(rpc, account);
    const graph = {
      nodes: [
        {
          id: "minutely",
          kind: "trigger.schedule",
          position: at(0),
          cron: "* * * * *",
          timezone: "Etc/UTC",
        },
        inbox(box.mailboxId),
        subjectContains("none", "e2e-subject-that-matches-nothing"),
        { id: "star", kind: "action.star", position: at(3) },
      ],
      edges: [edge("minutely", "inbox"), edge("inbox", "none"), edge("none", "star", "matched")],
    };
    await withWorkflow(rpc, account, { name: uniqueName(), enabled: true, graph }, async (wf) => {
      const runs = await until(
        async () =>
          (
            await rpc<{ runs: { id: string; status: string }[] }>("workflows.runs", {
              ...scope(account),
              workflowId: wf.id,
            })
          ).runs,
        (list) => list.some((r) => SETTLED.includes(r.status)),
        { timeout: 180_000, interval: 3_000, what: "a scheduled run to settle" },
      );
      const settled = runs.find((r) => SETTLED.includes(r.status));
      const run = await getRun(rpc, account, settled?.id ?? "");
      expect(run.status).toBe("completed");
      const detail = await rpc<{ run: { trigger: { source: string; firedFor: string | null } } }>(
        "workflows.getRun",
        { ...scope(account), runId: run.id },
      );
      expect(detail.run.trigger.source).toBe("schedule");
      expect(detail.run.trigger.firedFor).not.toBeNull();
      expect(nodeOf(run, "inbox").items.length).toBeGreaterThan(0);
      expect(nodeOf(run, "star").items).toHaveLength(0);
    });
  },
  4 * 60_000,
);
