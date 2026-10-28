import "server-only";
import { getEventValue, listFileValues, findFolderPath, readThread } from "@/ops/values";

import { parseAssignments, parseCases } from "../fields";
import { UNIT_MS } from "../steps/define";
import { T } from "../values";
import {
  dateOf,
  emit,
  emitOn,
  nothing,
  numberOf,
  type Params,
  record,
  type Runner,
  type StepCtx,
  type StepResult,
  str,
  text,
} from "./types";

export const EVENT_POLL_MS = 5 * 60_000;
const CALL_RECHECK_MS = 60 * 60_000;
export const MAX_LOOP_ENTRIES = 100;

const handledByExecutor: Runner = {
  run() {
    return Promise.reject(new Error("This step is run by the executor"));
  },
};

const ifRunner: Runner = {
  run(_ctx, params, item) {
    return Promise.resolve(
      emitOn(
        params.condition === true ? "yes" : "no",
        item.value,
        params.condition === true ? "yes" : "no",
      ),
    );
  },
};

const switchRunner: Runner = {
  run(ctx, _params, item) {
    for (const c of parseCases(
      ctx.node.params.cases?.kind === "literal" ? ctx.node.params.cases.value : [],
    )) {
      if (ctx.evaluateCel(c.when) === true) {
        return Promise.resolve(emitOn(`case:${c.id}`, item.value, c.name));
      }
    }
    return Promise.resolve(emitOn("else", item.value, "otherwise"));
  },
};

const filterRunner: Runner = {
  run(_ctx, params, item) {
    return Promise.resolve(
      params.condition === true ? emit(item.value, "kept") : nothing("filtered out"),
    );
  },
};

const splitRunner: Runner = {
  run(_ctx, params, item) {
    const entries = Array.isArray(params.list) ? params.list : [];
    return Promise.resolve({
      kind: "emit",
      emits: entries.map((entry, index) => ({ result: entry, key: `${item.key}/${index}` })),
      detail: `${entries.length} item(s)`,
    });
  },
};

function assignments(ctx: StepCtx, name: string): Record<string, unknown> {
  const bound = ctx.node.params[name];
  const fields = parseAssignments(bound?.kind === "literal" ? bound.value : []);
  return Object.fromEntries(fields.map((field) => [field.name, ctx.evaluate(field.value, T.json)]));
}

const setRunner: Runner = {
  run(ctx) {
    return Promise.resolve(emit(assignments(ctx, "fields")));
  },
};

const stopRunner: Runner = {
  run(_ctx, params) {
    return Promise.resolve(nothing(text(params, "reason") || "stopped here"));
  },
};

function untilFromState(ctx: StepCtx): Date | null {
  const until = ctx.state?.until;
  if (typeof until !== "string") return null;
  const date = new Date(until);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeWait(until: Date, detail: string): StepResult {
  return {
    kind: "wait",
    waitKind: "time",
    until,
    deadline: until,
    state: { until: until.toISOString() },
    detail,
  };
}

function waited(until: Date): StepResult {
  return {
    kind: "emit",
    emits: [{ result: { waitedUntil: until.toISOString() } }],
    detail: `waited until ${until.toISOString()}`,
  };
}

const delayRunner: Runner = {
  run(ctx, params) {
    const until =
      untilFromState(ctx) ??
      new Date(
        ctx.now.getTime() +
          numberOf(params, "amount", 1) *
            (UNIT_MS[text(params, "unit")] ?? UNIT_MS.hours ?? 3_600_000),
      );
    if (until.getTime() <= ctx.now.getTime()) return Promise.resolve(waited(until));
    return Promise.resolve(timeWait(until, `waiting until ${until.toISOString()}`));
  },
  preview() {
    return {
      kind: "emit",
      emits: [{ result: { waitedUntil: new Date().toISOString() } }],
      detail: "would wait",
    };
  },
};

const waitUntilRunner: Runner = {
  run(ctx, params) {
    const until = untilFromState(ctx) ?? dateOf(params, "at");
    if (!until) throw new Error("Wait until needs a date");
    if (until.getTime() <= ctx.now.getTime()) return Promise.resolve(waited(until));
    return Promise.resolve(timeWait(until, `waiting until ${until.toISOString()}`));
  },
  preview(_ctx, params) {
    return {
      kind: "emit",
      emits: [{ result: { waitedUntil: str(params.at) } }],
      detail: "would wait",
    };
  },
};

function deadlineOf(ctx: StepCtx, params: Params): Date {
  const stored = ctx.state?.deadline;
  if (typeof stored === "string") return new Date(stored);
  return new Date(
    ctx.now.getTime() +
      numberOf(params, "amount", 3) * (UNIT_MS[text(params, "unit")] ?? 86_400_000),
  );
}

function pollAgain(
  ctx: StepCtx,
  deadline: Date,
  state: Record<string, unknown>,
  detail: string,
): StepResult {
  const until = new Date(Math.min(deadline.getTime(), ctx.now.getTime() + EVENT_POLL_MS));
  return {
    kind: "wait",
    waitKind: "event",
    until,
    deadline,
    state: { ...state, deadline: deadline.toISOString() },
    detail,
  };
}

async function waitForReply(
  ctx: StepCtx,
  params: Params,
  deadline: Date,
): Promise<StepResult | null> {
  const message = record(params.message);
  const mailboxId = str(message.mailboxId);
  const threadId = str(message.threadId) || str(message.id);
  if (!mailboxId || !threadId) throw new Error("Wait for a reply needs a message");
  const handle = await ctx.mailbox(mailboxId);
  const thread = await readThread(handle, threadId);
  const known = Array.isArray(ctx.state?.known) ? ctx.state.known.map(String) : null;
  if (!known) {
    return pollAgain(
      ctx,
      deadline,
      { known: thread.messages.map((m) => m.id) },
      "waiting for a reply",
    );
  }
  const self = handle.email.toLowerCase();
  const reply = thread.messages.find(
    (m) => !known.includes(m.id) && !m.from.toLowerCase().includes(self),
  );
  if (reply) return emitOn("matched", reply, `reply from ${reply.from}`);
  return pollAgain(ctx, deadline, { known }, "waiting for a reply");
}

async function waitForRsvp(
  ctx: StepCtx,
  params: Params,
  deadline: Date,
): Promise<StepResult | null> {
  const event = record(params.calendarEvent);
  const accountId = str(event.accountId);
  const calendarId = str(event.calendarId);
  const eventId = str(event.id);
  if (!accountId || !calendarId || !eventId)
    throw new Error("Wait for a reply to an invitation needs an event");
  const account = await ctx.calendar(accountId);
  const current = await getEventValue(account, calendarId, eventId);
  const responses = Object.fromEntries(current.attendees.map((a) => [a.email, a.response]));
  const known = record(ctx.state?.responses);
  if (!ctx.state?.responses) {
    return pollAgain(ctx, deadline, { responses }, "waiting for replies");
  }
  const changed = current.attendees.find(
    (a) => known[a.email] !== a.response && a.response !== "needsAction",
  );
  if (changed) return emitOn("matched", current, `${changed.email} replied ${changed.response}`);
  return pollAgain(ctx, deadline, { responses }, "waiting for replies");
}

async function waitForFile(
  ctx: StepCtx,
  params: Params,
  deadline: Date,
): Promise<StepResult | null> {
  const drive = await ctx.drive(text(params, "drive"));
  const folderId = await findFolderPath(drive, text(params, "folder"));
  const files = await listFileValues(drive, folderId, 500);
  const known = Array.isArray(ctx.state?.known) ? ctx.state.known.map(String) : null;
  if (!known)
    return pollAgain(ctx, deadline, { known: files.map((f) => f.id) }, "waiting for a file");
  const added = files.find((f) => !known.includes(f.id) && f.kind !== "folder");
  if (added) return emitOn("matched", added, `${added.name} arrived`);
  return pollAgain(ctx, deadline, { known }, "waiting for a file");
}

const waitForRunner: Runner = {
  async run(ctx, params, item) {
    const deadline = deadlineOf(ctx, params);
    const kind = text(params, "event");
    const result =
      kind === "rsvp"
        ? await waitForRsvp(ctx, params, deadline)
        : kind === "file"
          ? await waitForFile(ctx, params, deadline)
          : await waitForReply(ctx, params, deadline);
    if (result?.kind === "wait" && deadline.getTime() <= ctx.now.getTime()) {
      return emitOn("timeout", item.value, "timed out");
    }
    return result ?? emitOn("timeout", item.value, "timed out");
  },
  preview(_ctx, _params, item) {
    return emitOn("timeout", item.value, "would wait; a test run goes on through Timed out");
  },
};

const approvalRunner: Runner = {
  run(ctx, params) {
    const wait = ctx.wait;
    if (
      wait?.status === "resolved" &&
      (wait.decision === "approved" || wait.decision === "denied")
    ) {
      const decided = {
        decision: wait.decision,
        decidedBy: { email: str(ctx.state?.decidedByEmail), name: str(ctx.state?.decidedByName) },
        note: wait.note ?? "",
        decidedAt: (wait.decidedAt ?? ctx.now).toISOString(),
      };
      return Promise.resolve({
        kind: "emit",
        emits: [{ handle: wait.decision, result: decided }],
        detail: wait.decision,
      });
    }
    const deadline = wait?.deadlineAt ?? deadlineOf(ctx, params);
    if (deadline.getTime() <= ctx.now.getTime()) {
      return Promise.resolve({
        kind: "emit",
        emits: [
          {
            handle: "timeout",
            result: {
              decision: "timeout",
              decidedBy: { email: "", name: "" },
              note: "",
              decidedAt: ctx.now.toISOString(),
            },
          },
        ],
        detail: "nobody answered in time",
      });
    }
    const approvers = Array.isArray(params.approvers) ? params.approvers.map(String) : [];
    if (approvers.length === 0) throw new Error("Pick who approves");
    return Promise.resolve({
      kind: "wait",
      waitKind: "approval",
      until: deadline,
      deadline,
      state: { deadline: deadline.toISOString() },
      detail: "waiting for approval",
      approvers,
      request: text(params, "message"),
    });
  },
  preview() {
    return {
      kind: "emit",
      emits: [
        {
          handle: "approved",
          result: {
            decision: "approved",
            decidedBy: { email: "", name: "" },
            note: "",
            decidedAt: new Date().toISOString(),
          },
        },
      ],
      detail: "would ask for approval; a test run goes on through Approved",
    };
  },
};

function childIds(ctx: StepCtx): string[] {
  return Array.isArray(ctx.state?.children) ? ctx.state.children.map(String) : [];
}

function callWait(ctx: StepCtx, children: string[], detail: string): StepResult {
  return {
    kind: "wait",
    waitKind: "call",
    until: new Date(ctx.now.getTime() + CALL_RECHECK_MS),
    deadline: null,
    state: { children },
    detail,
    childRunIds: children,
  };
}

async function settledChildren(ctx: StepCtx, children: string[]) {
  const runs = await ctx.childRuns(children);
  const done = runs.filter((run) => !["pending", "running", "waiting"].includes(run.status));
  return { runs, done: done.length === children.length };
}

const callRunner: Runner = {
  async run(ctx, params) {
    const known = childIds(ctx);
    if (known.length === 0) {
      const child = await ctx.startChild({
        workflowId: text(params, "workflow"),
        inputs: assignments(ctx, "inputs"),
        key: "0",
      });
      return callWait(ctx, [child], "waiting for the called workflow");
    }
    const { runs, done } = await settledChildren(ctx, known);
    if (!done) return callWait(ctx, known, "waiting for the called workflow");
    const [run] = runs;
    if (!run || run.status !== "completed") {
      throw new Error(
        `The called workflow ${run?.status ?? "disappeared"}${run?.error ? `: ${run.error}` : ""}`,
      );
    }
    return emit(run.output ?? {}, "returned");
  },
  preview() {
    return emit({}, "would run the other workflow");
  },
};

const loopRunner: Runner = {
  run(_ctx, params, item) {
    const entries = Array.isArray(params.list) ? params.list : [];
    if (entries.length > MAX_LOOP_ENTRIES) {
      throw new Error(`A loop runs at most ${MAX_LOOP_ENTRIES} times`);
    }
    return Promise.resolve({
      kind: "emit",
      emits: entries.map((entry, index) => ({ result: entry, key: `${item.key}/${index}` })),
      detail: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
    });
  },
};

const returnRunner: Runner = {
  run(ctx) {
    return Promise.resolve(emit(assignments(ctx, "fields"), "returned"));
  },
};

export const LOGIC_RUNNERS = {
  "logic.if": ifRunner,
  "logic.switch": switchRunner,
  "logic.filter": filterRunner,
  "logic.split": splitRunner,
  "logic.aggregate": handledByExecutor,
  "logic.merge": handledByExecutor,
  "logic.join": handledByExecutor,
  "logic.set": setRunner,
  "logic.stop": stopRunner,
  "flow.delay": delayRunner,
  "flow.waitUntil": waitUntilRunner,
  "flow.waitFor": waitForRunner,
  "flow.approval": approvalRunner,
  "flow.call": callRunner,
  "flow.loop": loopRunner,
  "flow.endLoop": handledByExecutor,
  "flow.return": returnRunner,
} as const satisfies Record<string, Runner>;
