import type { Edge, Node } from "@xyflow/react";
import { nanoid } from "nanoid";

import { isRecord } from "@/lib/guards";

import { edgeLabel, nodeMailboxId, outputLabel } from "./kinds";
import type {
  LeafPredicate,
  MergeKind,
  PredicateNode,
  SourceHandle,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowSourceState,
} from "./schema";
import {
  DEFAULT_DECISION_STATE_FIELDS,
  DEFAULT_TARGET_HANDLE,
  edgeId,
  isSourceHandle,
  mergeInputHandle,
} from "./schema";

export interface GraphMailbox {
  mailboxId: string;
  slug: string;
  email: string;
  aiEnabled?: boolean;
}

export interface WfData extends Record<string, unknown> {
  node: WorkflowNode;
  mailboxes: GraphMailbox[];
  source?: WorkflowSourceState;
}

export type WfNode = Node<WfData, WorkflowNodeKind>;

export interface WfKindData<K extends WorkflowNodeKind> extends WfData {
  node: Extract<WorkflowNode, { kind: K }>;
}

export type WfKindNode<K extends WorkflowNodeKind> = Node<WfKindData<K>, K>;

function isWfData(data: Record<string, unknown>): data is WfData {
  return isRecord(data.node) && typeof data.node.kind === "string" && Array.isArray(data.mailboxes);
}

export function wfData(data: Record<string, unknown> | undefined): WfData | undefined {
  return data && isWfData(data) ? data : undefined;
}

export const ROW_Y = [0, 210, 570, 890] as const;
export const ARRIVAL_ROW_Y = [0, 150, 360, 670] as const;
export const H_GAP = 280;

export function newNodeId(): string {
  return nanoid(10);
}

export function newPredicate(): LeafPredicate {
  return { kind: "predicate", field: "from", op: "contains", value: "" };
}

export function newGroupPredicate(): PredicateNode {
  return { kind: "group", logic: "all", children: [newPredicate()] };
}

export function newNode(
  kind: WorkflowNodeKind,
  position: { x: number; y: number },
  mailboxes: GraphMailbox[] = [],
): WorkflowNode {
  const id = newNodeId();
  switch (kind) {
    case "trigger.schedule":
      return {
        id,
        position,
        kind,
        cron: "0 9 * * 1-5",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC",
      };
    case "trigger.once":
      return { id, position, kind, at: new Date().toISOString() };
    case "mailbox.source":
      return {
        id,
        position,
        kind,
        mailboxId: mailboxes[0]?.mailboxId ?? "",
        operation: "incoming",
        folder: "inbox",
        limit: 50,
      };
    case "condition":
      return { id, position, kind, predicate: newGroupPredicate() };
    case "decision.ask":
      return {
        id,
        position,
        kind,
        state: { fields: [...DEFAULT_DECISION_STATE_FIELDS] },
        questions: [],
      };
    case "decision.branch":
      return { id, position, kind, yesAt: 0.8, noAt: 0.2, minProbability: 0.6 };
    case "action.label":
      return { id, position, kind, label: "work" };
    case "action.autoBcc":
      return { id, position, kind, address: "" };
    case "action.system":
      return { id, position, kind, operation: "cimd-prune" };
    default:
      return { id, position, kind };
  }
}

export function graphEdge(
  source: string,
  target: string,
  sourceHandle: WorkflowEdge["sourceHandle"] = "out",
  targetHandle: string = DEFAULT_TARGET_HANDLE,
): WorkflowEdge {
  return {
    id: edgeId(source, sourceHandle, target, targetHandle),
    source,
    sourceHandle,
    target,
    ...(targetHandle !== DEFAULT_TARGET_HANDLE ? { targetHandle } : {}),
  };
}

function listSource(
  position: { x: number; y: number },
  mailbox: GraphMailbox | undefined,
): WorkflowNode {
  return {
    id: newNodeId(),
    position,
    kind: "mailbox.source",
    mailboxId: mailbox?.mailboxId ?? "",
    operation: "list",
    folder: "inbox",
    limit: 50,
  };
}

export function branchGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.schedule", { x: 0, y: 0 });
  const left = listSource({ x: -H_GAP, y: ROW_Y[1] }, mailboxes[0]);
  const right = listSource({ x: H_GAP, y: ROW_Y[1] }, mailboxes[1] ?? mailboxes[0]);
  const markRead = newNode("action.markRead", { x: -H_GAP, y: ROW_Y[2] });
  const label = newNode("action.label", { x: H_GAP, y: ROW_Y[2] });

  return {
    nodes: [trigger, left, right, markRead, label],
    edges: [
      graphEdge(trigger.id, left.id),
      graphEdge(trigger.id, right.id),
      graphEdge(left.id, markRead.id),
      graphEdge(right.id, label.id),
    ],
  };
}

export function defaultGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.newMail", { x: 0, y: 0 });
  const source = newNode("mailbox.source", { x: 0, y: ARRIVAL_ROW_Y[1] }, mailboxes);
  const condition = newNode("condition", { x: 0, y: ARRIVAL_ROW_Y[2] });
  const action = newNode("action.archive", {
    x: -H_GAP / 2,
    y: ARRIVAL_ROW_Y[3],
  });

  return {
    nodes: [trigger, source, condition, action],
    edges: [
      graphEdge(trigger.id, source.id),
      graphEdge(source.id, condition.id),
      graphEdge(condition.id, action.id, "matched"),
    ],
  };
}

function incomingSource(
  position: { x: number; y: number },
  mailbox: GraphMailbox | undefined,
): WorkflowNode {
  return {
    id: newNodeId(),
    position,
    kind: "mailbox.source",
    mailboxId: mailbox?.mailboxId ?? "",
    operation: "incoming",
    folder: "inbox",
    limit: 50,
  };
}

export function arrivalGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const leftTrigger = newNode("trigger.newMail", { x: -H_GAP, y: 0 });
  const rightTrigger = newNode("trigger.newMail", { x: H_GAP, y: 0 });
  const left = incomingSource({ x: -H_GAP, y: ARRIVAL_ROW_Y[1] }, mailboxes[0]);
  const right = incomingSource({ x: H_GAP, y: ARRIVAL_ROW_Y[1] }, mailboxes[1] ?? mailboxes[0]);
  const label = newNode("action.label", { x: -H_GAP, y: ARRIVAL_ROW_Y[2] });
  const star = newNode("action.star", { x: H_GAP, y: ARRIVAL_ROW_Y[2] });

  return {
    nodes: [leftTrigger, rightTrigger, left, right, label, star],
    edges: [
      graphEdge(leftTrigger.id, left.id),
      graphEdge(rightTrigger.id, right.id),
      graphEdge(left.id, label.id),
      graphEdge(right.id, star.id),
    ],
  };
}

export function mergeGraph(kind: MergeKind, mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.schedule", { x: 0, y: 0 });
  const left = listSource({ x: -H_GAP, y: ROW_Y[1] }, mailboxes[0]);
  const right = listSource({ x: H_GAP, y: ROW_Y[1] }, mailboxes[1] ?? mailboxes[0]);
  const merge = newNode(kind, { x: 0, y: ROW_Y[2] });
  const label = newNode("action.label", { x: 0, y: ROW_Y[3] });

  return {
    nodes: [trigger, left, right, merge, label],
    edges: [
      graphEdge(trigger.id, left.id),
      graphEdge(trigger.id, right.id),
      graphEdge(left.id, merge.id, "out", mergeInputHandle(0)),
      graphEdge(right.id, merge.id, "out", mergeInputHandle(1)),
      graphEdge(merge.id, label.id),
    ],
  };
}

export const GRAPH_TEMPLATES = ["single", "arrival", "branch", "append", "join"] as const;
export type GraphTemplate = (typeof GRAPH_TEMPLATES)[number];

export const TEMPLATE_LABELS: Record<GraphTemplate, string> = {
  single: "One mailbox, on arrival",
  arrival: "Two mailboxes, on arrival",
  branch: "Two mailboxes, on a schedule",
  append: "Two mailboxes, one shared action",
  join: "Two mailboxes, act once both are read",
};

export function templateGraph(template: GraphTemplate, mailboxes: GraphMailbox[]): WorkflowGraph {
  if (template === "join") return mergeGraph("merge.join", mailboxes);
  if (template === "append") return mergeGraph("merge.append", mailboxes);
  if (template === "branch") return branchGraph(mailboxes);
  if (template === "arrival") return arrivalGraph(mailboxes);
  return defaultGraph(mailboxes);
}

export function toFlow(
  graph: WorkflowGraph,
  mailboxes: GraphMailbox[],
  sources: WorkflowSourceState[] = [],
): { nodes: WfNode[]; edges: Edge[] } {
  const byTrigger = new Map(sources.map((s) => [s.triggerNodeId, s]));
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: { node, mailboxes, source: byTrigger.get(node.id) },
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle:
        edge.targetHandle && edge.targetHandle !== DEFAULT_TARGET_HANDLE ? edge.targetHandle : null,
      type: "smoothstep",
      animated: true,
      label: outputLabel(graph, edge),
      ariaLabel: edgeLabel(graph, edge),
    })),
  };
}

export function flowHandle(handle: string | null | undefined): SourceHandle {
  return handle && isSourceHandle(handle) ? handle : "out";
}

export function fromFlow(nodes: WfNode[], edges: Edge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({ ...n.data.node, position: n.position })),
    edges: edges.map((e) => {
      const handle = flowHandle(e.sourceHandle);
      return {
        id: e.id,
        source: e.source,
        sourceHandle: handle,
        target: e.target,
        ...(e.targetHandle && e.targetHandle !== DEFAULT_TARGET_HANDLE
          ? { targetHandle: e.targetHandle }
          : {}),
      };
    }),
  };
}

export function targetsOf(graph: WorkflowGraph, id: string): WorkflowNode[] {
  const ids = new Set(graph.edges.filter((e) => e.source === id).map((e) => e.target));
  return graph.nodes.filter((n) => ids.has(n.id));
}

export function graphMailboxIds(graph: WorkflowGraph): string[] {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    const mailboxId = nodeMailboxId(node);
    if (mailboxId) ids.add(mailboxId);
  }
  return [...ids];
}
