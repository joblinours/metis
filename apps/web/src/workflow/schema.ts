import { z } from "zod";

import { bindingSchema } from "./expr";

export const GRAPH_VERSION = 2;
export const MAX_GRAPH_NODES = 100;
export const MAX_GRAPH_EDGES = 200;
export const MAX_STEP_TITLE = 60;
export const MAX_MERGE_INPUTS = 16;
export const BARRIER_ITEM_KEY = "barrier";
export const MAX_CONCURRENCY = 20;

export const WORKFLOW_KINDS = ["user", "scheduled-send", "snooze", "system"] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export const RUN_STATUSES = [
  "pending",
  "running",
  "waiting",
  "completed",
  "partial",
  "failed",
  "blocked",
  "cancelled",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const STEP_STATUSES = [
  "pending",
  "running",
  "waiting",
  "completed",
  "skipped",
  "failed",
  "blocked",
  "dispatching",
  "unknown",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const SEND_RESOLUTION_OUTCOMES = ["verified", "closed"] as const;
export type SendResolutionOutcome = (typeof SEND_RESOLUTION_OUTCOMES)[number];

export const SEND_CLOSE_REASONS = ["reported-delivered", "not-delivered", "abandoned"] as const;
export type SendCloseReason = (typeof SEND_CLOSE_REASONS)[number];

export const ON_ERROR = ["fail", "branch", "continue"] as const;
export type OnError = (typeof ON_ERROR)[number];

export const WAIT_KINDS = ["time", "event", "approval", "call"] as const;
export type WaitKind = (typeof WAIT_KINDS)[number];

export const WAIT_STATUSES = ["open", "resolved", "expired", "cancelled"] as const;
export type WaitStatus = (typeof WAIT_STATUSES)[number];

export const BLOB_KINDS = ["draft", "bytes"] as const;
export type BlobKind = (typeof BLOB_KINDS)[number];

export const ENDPOINT_KINDS = ["webhook", "graph", "google-channel"] as const;
export type EndpointKind = (typeof ENDPOINT_KINDS)[number];

export const NODE_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const HANDLE_PATTERN =
  /^(out|yes|no|else|error|matched|timeout|approved|denied|unsure|other|(q|opt|lvl|case|cat):[A-Za-z0-9_]{1,40})$/;

export function isHandle(value: string): boolean {
  return HANDLE_PATTERN.test(value);
}

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

const position = z.object({ x: z.number(), y: z.number() });

export const nodeSchema = z.object({
  id: z.string().regex(NODE_ID_PATTERN, "A step id is a letter followed by letters, digits or _"),
  step: z.string().min(1).max(64),
  title: z.string().trim().max(MAX_STEP_TITLE).optional(),
  skip: z.boolean().optional(),
  position,
  params: z.record(z.string().max(64), bindingSchema).default({}),
  onError: z.enum(ON_ERROR).optional(),
});

export type GraphNode = z.infer<typeof nodeSchema>;

export const DEFAULT_TARGET_HANDLE = "in";

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
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(64),
  sourceHandle: z.string().refine(isHandle, "Unknown output on a step").default("out"),
  target: z.string().min(1).max(64),
  targetHandle: z
    .string()
    .regex(/^in(:\d{1,2})?$/)
    .optional(),
});

export type GraphEdge = z.infer<typeof edgeSchema>;

export const LIMIT_MODES = ["debounce", "throttle"] as const;
export type LimitMode = (typeof LIMIT_MODES)[number];

export const graphSettingsSchema = z.object({
  concurrency: z.number().int().min(1).max(MAX_CONCURRENCY).optional(),
  limit: z
    .object({
      mode: z.enum(LIMIT_MODES),
      key: z.string().trim().min(1).max(500),
      seconds: z
        .number()
        .int()
        .min(1)
        .max(7 * 86_400),
    })
    .optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export type GraphSettings = z.infer<typeof graphSettingsSchema>;

export const graphSchema = z.object({
  version: z.literal(GRAPH_VERSION),
  nodes: z.array(nodeSchema).min(1).max(MAX_GRAPH_NODES),
  edges: z.array(edgeSchema).max(MAX_GRAPH_EDGES),
  settings: graphSettingsSchema.default({}),
});

export type WorkflowGraph = z.infer<typeof graphSchema>;
export type GraphShape = Pick<WorkflowGraph, "nodes" | "edges">;

export const workflowDefinitionInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  graph: graphSchema,
});

export type WorkflowDefinitionInput = z.infer<typeof workflowDefinitionInputSchema>;

export const workflowSourceStateSchema = z.object({
  triggerNodeId: z.string(),
  resource: z.string().nullable(),
  paused: z.boolean(),
  baselined: z.boolean(),
  lastScanAt: z.string().nullable(),
  error: z.string().nullable(),
  push: z.boolean(),
});

export type WorkflowSourceState = z.infer<typeof workflowSourceStateSchema>;
