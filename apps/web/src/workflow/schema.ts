import { z } from "zod";

import { MAIL_FOLDERS } from "@/types/mail";

export const MAX_GRAPH_NODES = 100;
export const MAX_GRAPH_EDGES = 200;
export const MAX_PREDICATE_DEPTH = 5;
export const MAX_PREDICATE_LEAVES = 25;

export const WORKFLOW_KINDS = ["user", "scheduled-send", "snooze", "system"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
  "blocked",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const NODE_STATUSES = [
  "pending",
  "running",
  "completed",
  "skipped",
  "failed",
  "blocked",
  "dispatching",
  "unknown",
] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const SEND_RESOLUTION_OUTCOMES = ["verified", "closed"] as const;
export type SendResolutionOutcome = (typeof SEND_RESOLUTION_OUTCOMES)[number];

export const SEND_CLOSE_REASONS = ["reported-delivered", "not-delivered", "abandoned"] as const;
export type SendCloseReason = (typeof SEND_CLOSE_REASONS)[number];

export const STRING_PREDICATE_FIELDS = ["from", "to", "cc", "subject", "body"] as const;
export type StringPredicateField = (typeof STRING_PREDICATE_FIELDS)[number];

export const PREDICATE_FIELDS = [...STRING_PREDICATE_FIELDS, "hasAttachment"] as const;
export type PredicateField = (typeof PREDICATE_FIELDS)[number];

export const STRING_OPS = ["contains", "equals", "startsWith", "endsWith"] as const;
export type StringOp = (typeof STRING_OPS)[number];

export const PREDICATE_LOGIC = ["all", "any"] as const;
export type PredicateLogic = (typeof PREDICATE_LOGIC)[number];

export const stringPredicateSchema = z.object({
  kind: z.literal("predicate"),
  field: z.enum(STRING_PREDICATE_FIELDS),
  op: z.enum(STRING_OPS),
  value: z.string().min(1).max(200),
  caseSensitive: z.boolean().optional(),
});

export const attachmentPredicateSchema = z.object({
  kind: z.literal("predicate"),
  field: z.literal("hasAttachment"),
  op: z.literal("is"),
  value: z.enum(["true", "false"]),
});

export const leafPredicateSchema = z.union([stringPredicateSchema, attachmentPredicateSchema]);

export type LeafPredicate = z.infer<typeof leafPredicateSchema>;

export type PredicateNode =
  | LeafPredicate
  | { kind: "group"; logic: PredicateLogic; children: PredicateNode[] };

export const predicateNodeSchema: z.ZodType<PredicateNode> = z.lazy(() =>
  z.union([
    leafPredicateSchema,
    z.object({
      kind: z.literal("group"),
      logic: z.enum(PREDICATE_LOGIC),
      children: z.array(predicateNodeSchema).min(1),
    }),
  ]),
);

export const MAILBOX_OPERATIONS = ["incoming", "message", "list", "draft"] as const;
export type MailboxOperation = (typeof MAILBOX_OPERATIONS)[number];

export const SYSTEM_OPERATIONS = ["cimd-prune", "audit-prune"] as const;
export type SystemOperation = (typeof SYSTEM_OPERATIONS)[number];

export const DECISION_STATE_FIELDS = [
  "from",
  "to",
  "cc",
  "subject",
  "snippet",
  "body",
  "hasAttachment",
  "date",
] as const;
export type DecisionStateField = (typeof DECISION_STATE_FIELDS)[number];

export const DEFAULT_DECISION_STATE_FIELDS: DecisionStateField[] = ["from", "subject", "snippet"];

export const DECISION_QUESTION_TYPES = ["boolean", "choice", "score"] as const;
export type DecisionQuestionType = (typeof DECISION_QUESTION_TYPES)[number];

export const DECISION_OTHER_OPTION_ID = "o0";
export const MAX_DECISION_CHOICES = 255;
export const DECISION_BODY_MAX = 8000;

const decisionOptionSchema = z.object({
  id: z.string().regex(/^o[1-9]\d*$/),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
});

const decisionLevelSchema = z.object({
  id: z.string().regex(/^l\d+$/),
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).optional(),
});

const decisionQuestionBase = {
  id: z.string().regex(/^q\d+$/),
  instructions: z.string().trim().min(1).max(500),
};

export const decisionQuestionSchema = z.discriminatedUnion("type", [
  z.object({ ...decisionQuestionBase, type: z.literal("boolean") }),
  z.object({
    ...decisionQuestionBase,
    type: z.literal("choice"),
    options: z.array(decisionOptionSchema).min(2).max(MAX_DECISION_CHOICES),
    other: z.boolean().default(true),
  }),
  z.object({
    ...decisionQuestionBase,
    type: z.literal("score"),
    levels: z.array(decisionLevelSchema).min(2),
  }),
]);

export type DecisionQuestion = z.infer<typeof decisionQuestionSchema>;
export type DecisionOption = z.infer<typeof decisionOptionSchema>;
export type DecisionLevel = z.infer<typeof decisionLevelSchema>;

const probability = z.number().min(0).max(1);

const position = z.object({ x: z.number(), y: z.number() });

const base = { id: z.string().min(1).max(64), position };

export const askNodeSchema = z.object({
  ...base,
  kind: z.literal("decision.ask"),
  state: z.object({
    fields: z.array(z.enum(DECISION_STATE_FIELDS)).min(1),
  }),
  questions: z.array(decisionQuestionSchema),
});

export const nodeSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("trigger.newMail") }),
  z.object({
    ...base,
    kind: z.literal("trigger.schedule"),
    cron: z.string().min(1).max(120),
    timezone: z.string().min(1).max(64),
  }),
  z.object({ ...base, kind: z.literal("trigger.manual") }),
  z.object({
    ...base,
    kind: z.literal("trigger.once"),
    at: z.iso.datetime(),
  }),
  z.object({
    ...base,
    kind: z.literal("trigger.beforeSend"),
    mailboxId: z.string().max(64).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("mailbox.source"),
    mailboxId: z.string().min(1),
    operation: z.enum(MAILBOX_OPERATIONS).default("incoming"),
    folder: z.enum(MAIL_FOLDERS).default("inbox"),
    query: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    messageId: z.string().max(400).optional(),
    threadId: z.string().max(400).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("condition"),
    predicate: predicateNodeSchema,
  }),
  askNodeSchema,
  z.object({
    ...base,
    kind: z.literal("decision.branch"),
    yesAt: probability.default(0.8),
    noAt: probability.default(0.2),
    minProbability: probability.default(0.6),
  }),
  z.object({ ...base, kind: z.literal("merge.append") }),
  z.object({ ...base, kind: z.literal("merge.join") }),
  z.object({ ...base, kind: z.literal("action.markRead") }),
  z.object({ ...base, kind: z.literal("action.star") }),
  z.object({
    ...base,
    kind: z.literal("action.label"),
    label: z.string().min(1).max(64),
  }),
  z.object({ ...base, kind: z.literal("action.mute") }),
  z.object({ ...base, kind: z.literal("action.archive") }),
  z.object({ ...base, kind: z.literal("action.trash") }),
  z.object({ ...base, kind: z.literal("action.restore") }),
  z.object({ ...base, kind: z.literal("action.send") }),
  z.object({
    ...base,
    kind: z.literal("action.autoBcc"),
    address: z.email().max(200),
  }),
  z.object({
    ...base,
    kind: z.literal("action.system"),
    operation: z.enum(SYSTEM_OPERATIONS),
  }),
]);

export type WorkflowNode = z.infer<typeof nodeSchema>;
export type WorkflowNodeKind = WorkflowNode["kind"];

export const CONDITION_HANDLES = ["matched", "unmatched"] as const;
export type ConditionHandle = (typeof CONDITION_HANDLES)[number];

export const BRANCH_FIXED_HANDLES = ["yes", "no", "unsure", "other"] as const;

export type SourceHandle =
  | "out"
  | ConditionHandle
  | (typeof BRANCH_FIXED_HANDLES)[number]
  | `q:${string}`
  | `opt:${string}`
  | `lvl:${string}`;

const SOURCE_HANDLE_PATTERN =
  /^(out|matched|unmatched|yes|no|unsure|other|q:q\d+|opt:o[1-9]\d*|lvl:l\d+)$/;

export function isSourceHandle(value: string): value is SourceHandle {
  return SOURCE_HANDLE_PATTERN.test(value);
}

export const DEFAULT_TARGET_HANDLE = "in";
export const MAX_MERGE_INPUTS = 16;
export const MERGE_INPUT_PORT = "message" as const;
export const BARRIER_INPUT_KEY = "barrier";

export function mergeInputHandle(index: number): string {
  return `in:${index}`;
}

export function mergeInputIndex(handle: string | null | undefined): number {
  const match = /^in:(\d{1,2})$/.exec(handle ?? "");
  if (!match) return -1;
  const index = Number(match[1]);
  return index < MAX_MERGE_INPUTS ? index : -1;
}

export function edgeId(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle?: string | null,
): string {
  const port = targetHandle && targetHandle !== DEFAULT_TARGET_HANDLE ? `:${targetHandle}` : "";
  return `${source}:${sourceHandle}->${target}${port}`;
}

export const edgeSchema = z.object({
  id: z.string().min(1).max(150),
  source: z.string().min(1).max(64),
  sourceHandle: z.string().refine(isSourceHandle, "Unknown output on a step").default("out"),
  target: z.string().min(1).max(64),
  targetHandle: z
    .string()
    .regex(/^in(:\d{1,2})?$/)
    .optional(),
});

export type WorkflowEdge = z.infer<typeof edgeSchema>;

export const graphSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(MAX_GRAPH_NODES),
  edges: z.array(edgeSchema).max(MAX_GRAPH_EDGES),
});

export type WorkflowGraph = z.infer<typeof graphSchema>;

export const workflowDefinitionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  graph: graphSchema,
});

export type WorkflowDefinitionInput = z.infer<typeof workflowDefinitionInputSchema>;

export const workflowSourceStateSchema = z.object({
  triggerNodeId: z.string(),
  mailboxId: z.string().nullable(),
  paused: z.boolean(),
  baselined: z.boolean(),
  lastScanAt: z.string().nullable(),
  error: z.string().nullable(),
});

export type WorkflowSourceState = z.infer<typeof workflowSourceStateSchema>;

export const TRIGGER_KINDS = [
  "trigger.newMail",
  "trigger.schedule",
  "trigger.manual",
  "trigger.once",
  "trigger.beforeSend",
] as const satisfies readonly WorkflowNodeKind[];

export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export function isTriggerKind(kind: string): kind is TriggerKind {
  return (TRIGGER_KINDS as readonly string[]).includes(kind);
}

export const MERGE_KINDS = [
  "merge.append",
  "merge.join",
] as const satisfies readonly WorkflowNodeKind[];

export type MergeKind = (typeof MERGE_KINDS)[number];

export function isMergeKind(kind: string): kind is MergeKind {
  return (MERGE_KINDS as readonly string[]).includes(kind);
}

export const DECISION_KINDS = [
  "decision.ask",
  "decision.branch",
] as const satisfies readonly WorkflowNodeKind[];

export function isDecisionKind(kind: string): boolean {
  return (DECISION_KINDS as readonly string[]).includes(kind);
}

export const ACTION_KINDS = [
  "action.markRead",
  "action.star",
  "action.label",
  "action.mute",
  "action.archive",
  "action.trash",
  "action.autoBcc",
] as const satisfies readonly WorkflowNodeKind[];

export const WORKFLOW_NODE_KINDS = nodeSchema.options.map((option) => option.shape.kind.value);

export const AUTHORABLE_TRIGGER_KINDS = [
  "trigger.newMail",
  "trigger.schedule",
  "trigger.manual",
  "trigger.beforeSend",
] as const satisfies readonly WorkflowNodeKind[];
