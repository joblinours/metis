import type { RetryClass } from "../runtime";
import type {
  SourceHandle,
  WorkflowGraph,
  WorkflowKind,
  WorkflowNode,
  WorkflowNodeKind,
} from "../schema";

export type PortType = "signal" | "message" | "draft";

export const PORT_LABELS: Record<PortType, string> = {
  signal: "Start",
  message: "Mail",
  draft: "Outgoing mail",
};

export const NODE_CATEGORIES = ["trigger", "mail", "logic", "ai", "action", "system"] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Triggers",
  mail: "Mail",
  logic: "Logic",
  ai: "AI",
  action: "Actions",
  system: "Maintenance",
};

export interface CardLine {
  text: string;
  tone?: "muted" | "warn";
  mono?: boolean;
}

export type CardEntry = CardLine | string | false | null | undefined;

export interface CardContext {
  graph: GraphShape;
  mailboxEmail(mailboxId: string): string | null;
  labelName(key: string): string;
}

export type NodeOf<K extends WorkflowNodeKind> = Extract<WorkflowNode, { kind: K }>;

export type GraphShape = Pick<WorkflowGraph, "nodes" | "edges">;

export interface KindOutput {
  id: SourceHandle;
  label?: string;
}

export interface KindInput {
  type: PortType | "any";
  missing: string;
}

export interface KindCheckContext {
  graph: GraphShape;
  workflowKind: WorkflowKind;
  allowedMailboxIds?: readonly string[];
  aiMailboxIds?: readonly string[];
  allowDecisionNodes?: boolean;
  byId: Map<string, WorkflowNode>;
  incoming(nodeId: string): string[];
  outgoing(nodeId: string): string[];
  reachedBy(nodeId: string): ReadonlySet<WorkflowNodeKind>;
}

export interface NodeKindDefinition<K extends WorkflowNodeKind> {
  kind: K;
  label: string;
  category: NodeCategory;
  description: string;
  scope: "any" | "builtin" | "system";
  retry: RetryClass;
  input: KindInput | null;
  output(node: NodeOf<K>, input: PortType | null): PortType;
  outputs(node: NodeOf<K>, graph: GraphShape): KindOutput[];
  outputError: string;
  mailboxId?(node: NodeOf<K>): string | null;
  check?(node: NodeOf<K>, ctx: KindCheckContext): string[];
  card?(node: NodeOf<K>, ctx: CardContext): CardEntry[];
}

export const SINGLE_OUTPUT: KindOutput[] = [{ id: "out" }];

export const SINGLE_OUTPUT_ERROR = "Only an If step has Yes and No outputs";

export const NEEDS_MAIL: KindInput = {
  type: "message",
  missing: "Connect this step to a mailbox that provides mail",
};

export const NEEDS_DRAFT: KindInput = {
  type: "draft",
  missing: "Connect this step to a message being sent",
};

export const NEEDS_TRIGGER: KindInput = {
  type: "signal",
  missing: "Connect this step to a trigger",
};

export function passThrough(_node: unknown, input: PortType | null): PortType {
  return input ?? "signal";
}
