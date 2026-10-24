import type { DecisionAnswer } from "./decision";
import type {
  DecisionQuestion,
  NodeStatus,
  SendCloseReason,
  SendResolutionOutcome,
  SourceHandle,
  WorkflowNodeKind,
} from "./schema";

export interface DiscoveredMessage {
  mailboxId: string;
  messageId: string;
  threadId?: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  date?: string;
}

export interface DiscoveryCursor {
  mailboxId: string;
  folder: string;
  pageToken?: string;
  seen: string[];
  baselined: boolean;
  sweepPages?: number;
  scans: number;
  updatedAt: string;
}

export interface NodeReceipt {
  operation?: string;
  message?: { subject: string; from: string };
  providerMessageId?: string | null;
  dispatchedAt?: string;
  settledAt?: string;
  verifiedAt?: string;
  fingerprint?: string;
  decision?: DecisionReceipt;
}

export interface DecisionReceipt {
  handle: string;
  probability: number;
  model: string;
  score?: number;
}

export interface EnvelopeDecision {
  askNodeId: string;
  question: DecisionQuestion;
  answer: DecisionAnswer;
  model: string;
}

export interface NodeResolution {
  outcome: SendResolutionOutcome;
  reason: SendCloseReason | null;
  note: string | null;
  previousStatus: "dispatching" | "unknown";
  previousError: string | null;
  evidence: { providerMessageId: string; matched: string[] } | null;
  finished?: boolean;
}

export type RunInput =
  | {
      kind: "newMail";
      triggerNodeId: string;
      messages: DiscoveredMessage[];
    }
  | {
      kind: "schedule";
      triggerNodeId: string;
      firedFor: string;
      missed: number;
    }
  | {
      kind: "once";
      triggerNodeId: string;
      firedFor: string;
    }
  | {
      kind: "manual";
      triggerNodeId: string;
      requestedByUserId: string;
      messages?: { mailboxId: string; messageId: string }[];
    };

export interface RunSummaryLine {
  nodeId: string;
  kind: WorkflowNodeKind;
  status: NodeStatus;
  count: number;
  detail?: string;
}

export interface MessageFacts {
  id: string;
  threadId?: string;
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  bodyText?: string;
  hasAttachment?: boolean;
  date?: string;
  loaded: boolean;
}

export interface DraftFacts {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  hasAttachment: boolean;
}

export type Envelope =
  | { port: "signal"; key: string; lineage: string[] }
  | {
      port: "message";
      key: string;
      mailboxId: string;
      messageId: string;
      message: MessageFacts;
      lineage: string[];
      decision?: EnvelopeDecision;
    }
  | {
      port: "draft";
      key: string;
      mailboxId: string;
      draft: DraftFacts;
      lineage: string[];
    };

export interface NodeRunOutput {
  outputs?: { handle: SourceHandle; envelopes: Envelope[] }[];
  detail?: string;
  inputs?: { port: number; state: string; count: number }[];
}

export type RetryClass = "safe" | "dispatch" | "none";

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
