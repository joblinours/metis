import { type Binding, inferType, type Scope } from "../expr";
import { parseAssignments, parseCases } from "../fields";
import { T, type ValueType } from "../values";
import {
  AMOUNT_UNITS,
  expr,
  line,
  literal,
  literalOf,
  literalString,
  p,
  PASS,
  shown,
  step,
} from "./define";
import type { StepDef, TypeContext } from "./types";

const same = ({ input }: TypeContext): ValueType => input ?? T.json;

function amountOf(node: Parameters<typeof literalOf>[0], fallback: number): string {
  const value = literalOf(node, "amount");
  return typeof value === "number" ? String(value) : String(fallback);
}

export function assignmentType(value: Binding, scope: Scope): ValueType {
  if (value.kind === "template") return T.text;
  if (value.kind === "literal") {
    if (typeof value.value === "string") return T.text;
    if (typeof value.value === "number") return T.number;
    if (typeof value.value === "boolean") return T.boolean;
    return T.json;
  }
  const checked = inferType(value.cel, scope);
  return checked.ok ? checked.type : T.json;
}

const ifStep = step({
  key: "logic.if",
  label: "If",
  category: "logic",
  description: "Sends each item to Yes or No by a condition.",
  params: { condition: p.condition("Condition", { required: true, default: expr("") }) },
  output: same,
  outputs: () => [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  emits: PASS,
  effect: "read",
  beforeSend: true,
  card: (node) => [shown(node, "condition", "If") ?? line("Write a condition", "warn")],
});

const switchStep = step({
  key: "logic.switch",
  label: "Switch",
  category: "logic",
  description: "Sends each item to the first case whose condition holds, or to Otherwise.",
  params: { cases: p.cases("Cases", { default: literal([]) }) },
  output: same,
  outputs: (node) => [
    ...parseCases(literalOf(node, "cases")).map((c) => ({ id: `case:${c.id}`, label: c.name })),
    { id: "else", label: "Otherwise" },
  ],
  emits: PASS,
  effect: "read",
  beforeSend: true,
  check: ({ node, scope }) => {
    const cases = parseCases(literalOf(node, "cases"));
    if (cases.length === 0) return ["Add a case"];
    const problems: string[] = [];
    if (new Set(cases.map((c) => c.id)).size !== cases.length)
      problems.push("Two cases share an id");
    for (const c of cases) {
      const checked = inferType(c.when, scope);
      if (!checked.ok) problems.push(`${c.name}: ${checked.error}`);
      else if (checked.type.kind !== "boolean" && checked.type.kind !== "json") {
        problems.push(`${c.name}: the condition must be true or false`);
      }
    }
    return problems;
  },
  card: (node) => {
    const cases = parseCases(literalOf(node, "cases"));
    if (cases.length === 0) return [line("Add a case", "warn")];
    return cases.slice(0, 3).map((c) => line(`${c.name}: ${c.when}`));
  },
});

const filter = step({
  key: "logic.filter",
  label: "Filter",
  category: "logic",
  description: "Lets through only the items a condition holds for.",
  params: { condition: p.condition("Keep when", { required: true, default: expr("") }) },
  output: same,
  emits: PASS,
  effect: "read",
  beforeSend: true,
  card: (node) => [shown(node, "condition", "Keep") ?? line("Write a condition", "warn")],
});

const split = step({
  key: "logic.split",
  label: "Split",
  category: "logic",
  description: "Turns a list into items, so the steps after it run once for each entry.",
  params: {
    list: p.expr("List", T.list(T.json), { required: true, default: expr("item.attachments") }),
  },
  many: true,
  output: ({ infer }) => {
    const checked = infer("list");
    return checked?.ok && checked.type.kind === "list" ? checked.type.of : T.json;
  },
  effect: "read",
  card: (node) => [shown(node, "list", "Each of")],
});

const aggregate = step({
  key: "logic.aggregate",
  label: "Aggregate",
  category: "logic",
  description:
    "Waits for every item to arrive, then passes on one list: of all of them, or one list per key.",
  params: {
    key: p.expr("Group by", T.text, { help: "Leave empty for a single list of everything." }),
  },
  merge: "aggregate",
  output: ({ input }) =>
    T.object({ key: T.text, count: T.integer, items: T.list(input ?? T.json) }),
  effect: "read",
  card: (node) => [shown(node, "key", "Grouped by") ?? line("One list of everything")],
});

const merge = step({
  key: "logic.merge",
  label: "Merge",
  category: "logic",
  description:
    "Combines several branches into one, passing each item on once even if it arrives by two paths.",
  params: {},
  merge: "append",
  output: same,
  emits: PASS,
  effect: "read",
  card: () => [line("Passes on items as they arrive")],
});

const join = step({
  key: "logic.join",
  label: "Wait for all",
  category: "logic",
  description:
    "Waits until every branch into it has finished, then passes on all their items at once.",
  params: {},
  merge: "join",
  output: same,
  emits: PASS,
  effect: "read",
  card: () => [line("Waits for every branch")],
});

const set = step({
  key: "logic.set",
  label: "Set fields",
  category: "logic",
  description: "Builds a new item from named values, for the steps after it to use.",
  params: { fields: p.assignments("Fields", { default: literal([]) }) },
  output: ({ node, scope }) =>
    T.object(
      Object.fromEntries(
        parseAssignments(literalOf(node, "fields")).map((field) => [
          field.name,
          assignmentType(field.value, scope),
        ]),
      ),
    ),
  effect: "read",
  card: (node) => {
    const fields = parseAssignments(literalOf(node, "fields"));
    return fields.length === 0
      ? [line("Add a field", "warn")]
      : fields
          .slice(0, 3)
          .map((f) =>
            line(
              `${f.name} = ${f.value.kind === "expr" ? f.value.cel : f.value.kind === "template" ? f.value.text : JSON.stringify(f.value.value)}`,
            ),
          );
  },
});

const stop = step({
  key: "logic.stop",
  label: "Stop",
  category: "logic",
  description: "Ends this item's path here, with an optional note in the run history.",
  params: { reason: p.text("Note") },
  output: same,
  outputs: () => [],
  effect: "read",
  beforeSend: true,
  card: (node) => [shown(node, "reason", "") ?? line("Ends here")],
});

const delay = step({
  key: "flow.delay",
  label: "Delay",
  category: "flow",
  description:
    "Waits for a while before passing the item on. The run is paused while it waits, however long the wait.",
  params: {
    amount: p.number("Wait", { required: true, default: literal(1), min: 0 }),
    unit: p.select("Unit", AMOUNT_UNITS, { default: literal("hours") }),
  },
  output: () => T.object({ waitedUntil: T.date }),
  emits: PASS,
  effect: "read",
  card: (node) => [line(`Wait ${amountOf(node, 1)} ${literalString(node, "unit") || "hours"}`)],
});

const waitUntil = step({
  key: "flow.waitUntil",
  label: "Wait until",
  category: "flow",
  description: "Waits until a date and time, then passes the item on.",
  params: { at: p.datetime("Until", { required: true }) },
  output: () => T.object({ waitedUntil: T.date }),
  emits: PASS,
  effect: "read",
  card: (node) => [shown(node, "at", "Until") ?? line("Pick a time", "warn")],
});

export const WAIT_FOR = [
  { value: "reply", label: "A reply in the thread" },
  { value: "rsvp", label: "A reply to an invitation" },
  { value: "file", label: "A file in a folder" },
] as const;

const waitFor = step({
  key: "flow.waitFor",
  label: "Wait for",
  category: "flow",
  description:
    "Waits for something to happen, checking every few minutes, and goes on through Timed out when it doesn't.",
  params: {
    event: p.select("Wait for", WAIT_FOR, { default: literal("reply") }),
    message: p.expr("Message", T.mail, {
      default: expr("item"),
      visibleWhen: { param: "event", equals: ["reply"] },
    }),
    calendarEvent: p.expr("Event", T.event, {
      default: expr("item"),
      visibleWhen: { param: "event", equals: ["rsvp"] },
    }),
    drive: p.drive("Drive", { visibleWhen: { param: "event", equals: ["file"] } }),
    folder: p.driveFolder("Folder", { visibleWhen: { param: "event", equals: ["file"] } }),
    amount: p.number("Give up after", { required: true, default: literal(3), min: 1 }),
    unit: p.select("Unit", AMOUNT_UNITS, { default: literal("days") }),
  },
  output: ({ node }) => {
    const kind = literalString(node, "event");
    if (kind === "rsvp") return T.event;
    if (kind === "file") return T.file;
    return T.mail;
  },
  outputs: () => [
    { id: "matched", label: "Happened" },
    { id: "timeout", label: "Timed out" },
  ],
  emits: (handle) => (handle === "timeout" ? "input" : "result"),
  effect: "read",
  card: (node) => {
    const kind = WAIT_FOR.find((option) => option.value === literalString(node, "event"));
    return [
      line(kind?.label ?? "Pick what to wait for", kind ? undefined : "warn"),
      line(`Up to ${amountOf(node, 3)} ${literalString(node, "unit") || "days"}`, "muted"),
    ];
  },
});

const approval = step({
  key: "flow.approval",
  label: "Ask for approval",
  category: "flow",
  description:
    "Asks chosen members to approve or deny in the app, and waits for the first answer or the deadline.",
  params: {
    approvers: p.members("Approvers", { required: true, default: literal([]) }),
    message: p.longtext("Request", { required: true }),
    amount: p.number("Deadline", { required: true, default: literal(3), min: 1 }),
    unit: p.select("Unit", AMOUNT_UNITS, { default: literal("days") }),
  },
  output: () =>
    T.object({ decision: T.text, decidedBy: T.person, note: T.text, decidedAt: T.date }),
  outputs: () => [
    { id: "approved", label: "Approved" },
    { id: "denied", label: "Denied" },
    { id: "timeout", label: "No answer" },
  ],
  emits: PASS,
  effect: "read",
  card: (node, ctx) => {
    const value = literalOf(node, "approvers");
    const ids = Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
    return [
      ids.length > 0
        ? line(`Asks ${ids.map((id) => ctx.memberName(id) ?? "a member").join(", ")}`)
        : line("Pick who approves", "warn"),
      shown(node, "message", ""),
    ];
  },
});

const call = step({
  key: "flow.call",
  label: "Call workflow",
  category: "flow",
  description: "Runs another workflow with inputs, waits for it, and passes on what it returns.",
  params: {
    workflow: p.workflow("Workflow", { required: true }),
    inputs: p.assignments("Inputs", { default: literal([]) }),
  },
  output: () => T.json,
  effect: "write",
  card: (node, ctx) => {
    const id = literalString(node, "workflow");
    return [
      id ? line(`Runs ${ctx.workflowName(id) ?? "a workflow"}`) : line("Pick a workflow", "warn"),
    ];
  },
});

const loop = step({
  key: "flow.loop",
  label: "Loop",
  category: "flow",
  description:
    "Runs the steps up to End loop once for each entry of a list, then End loop collects what they give back.",
  params: {
    list: p.expr("For each of", T.list(T.json), { required: true }),
  },
  many: true,
  output: ({ infer }) => {
    const checked = infer("list");
    return checked?.ok && checked.type.kind === "list" ? checked.type.of : T.json;
  },
  outputs: () => [{ id: "out", label: "Each entry" }],
  effect: "read",
  card: (node) => [shown(node, "list", "Each of") ?? line("Pick a list", "warn")],
});

const endLoop = step({
  key: "flow.endLoop",
  label: "End loop",
  category: "flow",
  description:
    "Waits for every entry of its Loop, then passes on one item per looped item with the entries that reached it.",
  params: {},
  merge: "collect",
  output: ({ input }) => T.object({ results: T.list(input ?? T.json), count: T.integer }),
  effect: "read",
  card: () => [line("Collects each entry")],
});

const returns = step({
  key: "flow.return",
  label: "Return",
  category: "flow",
  description: "Sets what this workflow gives back to the workflow that called it.",
  params: { fields: p.assignments("Return", { default: literal([]) }) },
  output: () => T.json,
  outputs: () => [],
  effect: "read",
  card: (node) => {
    const fields = parseAssignments(literalOf(node, "fields"));
    return [
      fields.length > 0
        ? line(`Gives back ${fields.map((f) => f.name).join(", ")}`)
        : line("Gives back nothing"),
    ];
  },
});

export const LOGIC_STEPS = [
  ifStep,
  switchStep,
  filter,
  split,
  aggregate,
  merge,
  join,
  set,
  stop,
  delay,
  waitUntil,
  waitFor,
  approval,
  call,
  loop,
  endLoop,
  returns,
] as const satisfies readonly StepDef[];
