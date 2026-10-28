import type { DecisionAnswer } from "./decision";
import type { SendCloseReason, SendResolutionOutcome, StepStatus } from "./schema";

export const RUN_SOURCES = [
  "manual",
  "schedule",
  "once",
  "feed",
  "app",
  "inbound",
  "call",
] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

export interface RunInput {
  triggerNodeId: string;
  source: RunSource;
  event: unknown;
  firedFor?: string;
  missed?: number;
  requestedByUserId?: string;
  parentRunId?: string;
  parentStepRunId?: string;
}

export interface LoopFrame {
  node: string;
  origin: string;
}

export interface Item {
  key: string;
  value: unknown;
  trail: Record<string, unknown>;
  error?: string;
  loops?: LoopFrame[];
}

export interface Emit {
  handle: string;
  key: string;
  value: unknown;
  result: unknown;
}

export interface DecisionReceipt {
  handle: string;
  probability: number;
  model: string;
  score?: number;
}

export interface StepReceipt {
  operation?: string;
  item?: { title: string; subtitle: string };
  message?: { subject: string; from: string };
  providerMessageId?: string | null;
  resourceId?: string;
  dispatchedAt?: string;
  settledAt?: string;
  verifiedAt?: string;
  fingerprint?: string;
  decision?: DecisionReceipt;
  usage?: { model: string; inputTokens: number; outputTokens: number };
}

export interface StepRunOutput {
  emits?: Emit[];
  detail?: string;
  inputs?: { port: number; state: string; count: number }[];
}

export interface StepResolution {
  outcome: SendResolutionOutcome;
  reason: SendCloseReason | null;
  note: string | null;
  previousStatus: "dispatching" | "unknown";
  previousError: string | null;
  evidence: { providerMessageId: string; matched: string[] } | null;
  finished?: boolean;
}

export interface RunSummaryLine {
  nodeId: string;
  step: string;
  status: StepStatus;
  count: number;
  detail?: string;
}

export interface FeedCursor {
  scope: string;
  token?: string;
  resource?: string | null;
  seen?: string[];
  snapshot?: Record<string, string>;
  pageToken?: string;
  sweepPages?: number;
  scans: number;
  baselined: boolean;
  updatedAt: string;
}

export type WaitState = Record<string, unknown>;

export type TickStage = "setup" | "discovery" | "maintenance" | "execution";

export interface TickFailure {
  stage: TickStage;
  code: string;
}

export interface TickSummary {
  invocation: string;
  startedAt: string;
  discovered: number;
  discoveryErrors: number;
  claimed: number;
  completed: number;
  failed: number;
  blocked: number;
  remaining: number;
  discoverySkipped: boolean;
  durationMs: number;
  failure?: TickFailure;
  error?: string;
}

export type { DecisionAnswer };
