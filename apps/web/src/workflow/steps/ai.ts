import { answerLabel, branchHandles, branchQuestion, nodeQuestions } from "../decision";
import {
  AI_FIELD_TYPES,
  fieldDeclProblems,
  fieldsType,
  parseCategories,
  parseFieldDecls,
} from "../fields";
import { MAX_DECISION_CHOICES } from "../schema";
import { fieldsOf, T, type ValueType } from "../values";
import { ITEM, line, literal, literalOf, literalString, p, PASS, shown, step } from "./define";
import type { CheckContext, StepDef } from "./types";

const subject = p.expr("About", T.json, { default: ITEM, required: true });

function aiRules({ allowDecisionSteps }: CheckContext, decision: boolean): string[] {
  return decision && allowDecisionSteps === false
    ? ["Ask and Branch steps are turned off on this instance"]
    : [];
}

function questionsProblems(node: CheckContext["node"]): string[] {
  const questions = nodeQuestions(node);
  if (questions.length === 0) return ["Add a question to this Ask step"];
  const ids = questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) return ["Two questions share an id"];
  for (const question of questions) {
    if (question.type === "choice") {
      const total = question.options.length + (question.other ? 1 : 0);
      if (total > MAX_DECISION_CHOICES) {
        return [
          `A Pick one question can offer at most ${MAX_DECISION_CHOICES} answers, Other included`,
        ];
      }
    }
  }
  return [];
}

const ask = step({
  key: "ai.ask",
  label: "Ask",
  category: "ai",
  description:
    "Asks the decision model your questions about each item. Connect each question to a Branch step.",
  params: {
    subject,
    include: p.strings("Send these fields", {
      default: literal(["from", "subject", "snippet"]),
      help: "Only these fields of the item reach the model. Leave empty to send all of it.",
    }),
    questions: p.questions("Questions", { default: literal([]) }),
  },
  output: () => T.object({ answered: T.boolean }),
  outputs: (node) =>
    nodeQuestions(node).map((question, index) => ({
      id: `q:${question.id}`,
      label: `Q${index + 1}`,
    })),
  emits: PASS,
  effect: "read",
  ai: true,
  check: (ctx) => {
    const problems = [...aiRules(ctx, true), ...questionsProblems(ctx.node)];
    if (
      ctx
        .outgoing(ctx.node.id)
        .some((id) => ctx.graph.nodes.find((n) => n.id === id)?.step !== "ai.branch")
    ) {
      problems.push("An Ask step's questions connect only to Branch steps");
    }
    return problems;
  },
  card: (node) => {
    const questions = nodeQuestions(node);
    if (questions.length === 0) return [line("Add a question", "warn")];
    return [
      ...questions
        .slice(0, 2)
        .map((question, index) => line(`Q${index + 1}: ${question.instructions}`)),
      questions.length > 2 && line(`and ${questions.length - 2} more`, "muted"),
    ];
  },
});

const probability = (label: string, value: number) =>
  p.number(label, { bindable: false, default: literal(value), min: 0, max: 1 });

const branch = step({
  key: "ai.branch",
  label: "Branch",
  category: "ai",
  description: "Routes each item by the answer to the question it is connected to.",
  params: {
    yesAt: probability("Yes when at least", 0.8),
    noAt: probability("No when at most", 0.2),
    minProbability: probability("Take the top answer at", 0.6),
  },
  output: () => T.answer,
  outputs: (node, graph) => {
    const found = branchQuestion(graph, node.id);
    if (!found) return [];
    return branchHandles(found.question).map((handle) => ({
      id: handle,
      label: answerLabel(found.question, handle),
    }));
  },
  emits: PASS,
  effect: "read",
  check: (ctx) => {
    const problems = aiRules(ctx, true);
    if (!branchQuestion(ctx.graph, ctx.node.id)) {
      problems.push("Connect this Branch step to a question of an Ask step");
    }
    return problems;
  },
  card: (node, ctx) => {
    const found = branchQuestion(ctx.graph, node.id);
    return [
      found ? line(`On: ${found.question.instructions}`) : line("Connect a question", "warn"),
    ];
  },
});

export const AI_FORMATS = [
  { value: "text", label: "Text" },
  { value: "fields", label: "Fields" },
] as const;

const fieldsParam = (label: string) =>
  p.fields(label, {
    default: literal([]),
    help: `Each field is ${AI_FIELD_TYPES.join(", ")}.`,
  });

function dataType(node: CheckContext["node"]): ValueType {
  return literalString(node, "format") === "fields"
    ? fieldsType(parseFieldDecls(literalOf(node, "fields")))
    : T.object({});
}

function fieldRules(node: CheckContext["node"], needed: boolean): string[] {
  const problems = fieldDeclProblems(literalOf(node, "fields"), "fields");
  const decls = parseFieldDecls(literalOf(node, "fields"));
  if (decls.some((decl) => !(AI_FIELD_TYPES as readonly string[]).includes(decl.type))) {
    problems.push(`AI fields are ${AI_FIELD_TYPES.join(", ")}`);
  }
  if (needed && decls.length === 0) problems.push("Add a field for the model to fill in");
  return problems;
}

const generate = step({
  key: "ai.generate",
  label: "Write with AI",
  category: "ai",
  description: "Writes text, or fills in fields you declare, from a prompt.",
  params: {
    prompt: p.longtext("Prompt", { required: true }),
    format: p.select("Gives back", AI_FORMATS, { default: literal("text") }),
    fields: { ...fieldsParam("Fields"), visibleWhen: { param: "format", equals: ["fields"] } },
  },
  output: ({ node }) => T.object({ text: T.text, data: dataType(node), complete: T.boolean }),
  effect: "read",
  ai: true,
  check: (ctx) => [
    ...aiRules(ctx, false),
    ...(literalString(ctx.node, "format") === "fields" ? fieldRules(ctx.node, true) : []),
  ],
  card: (node) => [shown(node, "prompt", "")],
});

const extract = step({
  key: "ai.extract",
  label: "Extract fields",
  category: "ai",
  description: "Reads mail, an attachment or a file's text and fills in the fields you declare.",
  params: {
    source: p.expr("From", T.json, { default: ITEM, required: true }),
    instructions: p.longtext("Instructions"),
    fields: fieldsParam("Fields"),
  },
  output: ({ node }) =>
    T.object({ data: fieldsType(parseFieldDecls(literalOf(node, "fields"))), complete: T.boolean }),
  effect: "read",
  ai: true,
  check: (ctx) => [...aiRules(ctx, false), ...fieldRules(ctx.node, true)],
  card: (node) => {
    const decls = parseFieldDecls(literalOf(node, "fields"));
    return [
      decls.length > 0
        ? line(`Finds ${decls.map((d) => d.name).join(", ")}`)
        : line("Add a field", "warn"),
    ];
  },
});

export const SUMMARY_LENGTHS = [
  { value: "short", label: "A sentence" },
  { value: "medium", label: "A paragraph" },
  { value: "long", label: "A few paragraphs" },
] as const;

const summarize = step({
  key: "ai.summarize",
  label: "Summarize",
  category: "ai",
  description: "Summarizes mail, a thread, a file's text or any value.",
  params: {
    source: p.expr("Summarize", T.json, { default: ITEM, required: true }),
    length: p.select("Length", SUMMARY_LENGTHS, { default: literal("short") }),
  },
  output: () => T.object({ summary: T.text }),
  effect: "read",
  ai: true,
  check: (ctx) => aiRules(ctx, false),
  card: (node) => [
    line(
      SUMMARY_LENGTHS.find((l) => l.value === literalString(node, "length"))?.label ?? "A sentence",
    ),
  ],
});

const classify = step({
  key: "ai.classify",
  label: "Classify",
  category: "ai",
  description: "Puts each item in one of the categories you describe, or Other.",
  params: {
    source: p.expr("Classify", T.json, { default: ITEM, required: true }),
    instructions: p.longtext("Instructions"),
    categories: p.categories("Categories", { default: literal([]) }),
  },
  output: () => T.object({ category: T.text, label: T.text, confidence: T.number }),
  outputs: (node) => [
    ...parseCategories(literalOf(node, "categories")).map((c) => ({
      id: `cat:${c.id}`,
      label: c.name,
    })),
    { id: "other", label: "Other" },
  ],
  emits: PASS,
  effect: "read",
  ai: true,
  check: (ctx) => {
    const categories = parseCategories(literalOf(ctx.node, "categories"));
    const problems = aiRules(ctx, false);
    if (categories.length < 2) problems.push("Add at least two categories");
    if (new Set(categories.map((c) => c.id)).size !== categories.length) {
      problems.push("Two categories share an id");
    }
    return problems;
  },
  card: (node) => {
    const categories = parseCategories(literalOf(node, "categories"));
    return [
      categories.length > 0
        ? line(categories.map((c) => c.name).join(", "))
        : line("Add categories", "warn"),
    ];
  },
});

export const AGENTS = [
  { value: "mailbox", label: "Mailbox agent" },
  { value: "calendar", label: "Calendar agent" },
  { value: "drive", label: "Drive agent" },
  { value: "workspace", label: "Workspace agent" },
] as const;

const agent = step({
  key: "ai.agent",
  label: "Agent",
  category: "ai",
  description:
    "Gives a task to an agent that can read, but never change, mail, calendars or files, and passes on its answer.",
  params: {
    agent: p.select("Agent", AGENTS, { default: literal("mailbox") }),
    task: p.longtext("Task", { required: true }),
    mailbox: p.mailbox("Mailbox", {
      visibleWhen: { param: "agent", equals: ["mailbox"] },
      help: "Leave empty to use the item's mailbox.",
    }),
    calendar: p.calendar("Calendar", {
      visibleWhen: { param: "agent", equals: ["calendar"] },
      help: "Leave empty to use the item's calendar.",
    }),
    drive: p.drive("Drive", {
      visibleWhen: { param: "agent", equals: ["drive"] },
      help: "Leave empty to use the item's drive.",
    }),
    maxSteps: p.number("Most tool calls", {
      bindable: false,
      default: literal(8),
      min: 1,
      max: 20,
    }),
    minutes: p.number("Time limit (minutes)", {
      bindable: false,
      default: literal(5),
      min: 1,
      max: 30,
    }),
    format: p.select("Gives back", AI_FORMATS, { default: literal("text") }),
    fields: { ...fieldsParam("Fields"), visibleWhen: { param: "format", equals: ["fields"] } },
  },
  output: ({ node }) =>
    T.object({ text: T.text, data: dataType(node), sources: T.list(T.text), complete: T.boolean }),
  effect: "read",
  ai: true,
  check: (ctx) => [
    ...aiRules(ctx, false),
    ...(literalString(ctx.node, "format") === "fields" ? fieldRules(ctx.node, true) : []),
  ],
  card: (node) => [
    line(AGENTS.find((a) => a.value === literalString(node, "agent"))?.label ?? "Pick an agent"),
    shown(node, "task", ""),
  ],
});

export function stateFieldsOf(type: ValueType | null): string[] {
  return Object.keys((type && fieldsOf(type)) ?? {});
}

export const AI_STEPS = [
  ask,
  branch,
  generate,
  extract,
  summarize,
  classify,
  agent,
] as const satisfies readonly StepDef[];
