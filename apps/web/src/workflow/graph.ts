import { nanoid } from "nanoid";

import { nodeMailboxId } from "./kinds";
import type {
  LeafPredicate,
  MergeKind,
  PredicateNode,
  SourceHandle,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeKind,
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

export const CARD_WIDTH = 256;
const COLUMN_GAP = 96;
const ROW_GAP = 40;
const ESTIMATED_HEIGHT = 120;

type Point = { x: number; y: number };
const ORIGIN: Point = { x: 0, y: 0 };

export function layoutGraph(
  graph: WorkflowGraph,
  heightOf: (nodeId: string) => number = () => ESTIMATED_HEIGHT,
): WorkflowGraph {
  const ids = graph.nodes.map((n) => n.id);
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of graph.edges) {
    if (!parents.has(edge.target) || !children.has(edge.source)) continue;
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
  }

  const layer = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const up = parents.get(id) ?? [];
    const depth = up.length === 0 ? 0 : Math.max(...up.map((p) => depthOf(p, seen))) + 1;
    layer.set(id, depth);
    return depth;
  };
  for (const id of ids) depthOf(id, new Set());

  const columns: string[][] = [];
  for (const id of ids) {
    const index = layer.get(id) ?? 0;
    (columns[index] ??= []).push(id);
  }

  const y = new Map<string, number>();
  const order = new Map(ids.map((id, index) => [id, index]));
  const positions = new Map<string, Point>();
  const rank = (id: string) => {
    const up = (parents.get(id) ?? []).map((p) => y.get(p) ?? 0);
    return up.length > 0 ? up.reduce((a, b) => a + b, 0) / up.length : (order.get(id) ?? 0);
  };
  columns.forEach((column, index) => {
    const sorted = column.toSorted(
      (a, b) => rank(a) - rank(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
    const heights = sorted.map(heightOf);
    const total = heights.reduce((a, b) => a + b, 0) + ROW_GAP * (sorted.length - 1);
    let top = -total / 2;
    sorted.forEach((id, row) => {
      const height = heights[row] ?? ESTIMATED_HEIGHT;
      y.set(id, top + height / 2);
      positions.set(id, { x: index * (CARD_WIDTH + COLUMN_GAP), y: Math.round(top) });
      top += height + ROW_GAP;
    });
  });

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

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
  mailbox: GraphMailbox | undefined,
): Extract<WorkflowNode, { kind: "mailbox.source" }> {
  return {
    id: newNodeId(),
    position: ORIGIN,
    kind: "mailbox.source",
    mailboxId: mailbox?.mailboxId ?? "",
    operation: "list",
    folder: "inbox",
    limit: 50,
  };
}

function incomingSource(mailbox: GraphMailbox | undefined): WorkflowNode {
  return { ...listSource(mailbox), operation: "incoming" };
}

function branchGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.schedule", ORIGIN);
  const left = listSource(mailboxes[0]);
  const right = listSource(mailboxes[1] ?? mailboxes[0]);
  const markRead = newNode("action.markRead", ORIGIN);
  const label = newNode("action.label", ORIGIN);
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

function defaultGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.newMail", ORIGIN);
  const source = newNode("mailbox.source", ORIGIN, mailboxes);
  const condition = newNode("condition", ORIGIN);
  const action = newNode("action.archive", ORIGIN);
  return {
    nodes: [trigger, source, condition, action],
    edges: [
      graphEdge(trigger.id, source.id),
      graphEdge(source.id, condition.id),
      graphEdge(condition.id, action.id, "matched"),
    ],
  };
}

function arrivalGraph(mailboxes: GraphMailbox[]): WorkflowGraph {
  const leftTrigger = newNode("trigger.newMail", ORIGIN);
  const rightTrigger = newNode("trigger.newMail", ORIGIN);
  const left = incomingSource(mailboxes[0]);
  const right = incomingSource(mailboxes[1] ?? mailboxes[0]);
  const label = newNode("action.label", ORIGIN);
  const star = newNode("action.star", ORIGIN);
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

function mergeGraph(kind: MergeKind, mailboxes: GraphMailbox[]): WorkflowGraph {
  const trigger = newNode("trigger.schedule", ORIGIN);
  const left = listSource(mailboxes[0]);
  const right = listSource(mailboxes[1] ?? mailboxes[0]);
  const merge = newNode(kind, ORIGIN);
  const label = newNode("action.label", ORIGIN);
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

function rawTemplate(template: GraphTemplate, mailboxes: GraphMailbox[]): WorkflowGraph {
  if (template === "join") return mergeGraph("merge.join", mailboxes);
  if (template === "append") return mergeGraph("merge.append", mailboxes);
  if (template === "branch") return branchGraph(mailboxes);
  if (template === "arrival") return arrivalGraph(mailboxes);
  return defaultGraph(mailboxes);
}

export function templateGraph(template: GraphTemplate, mailboxes: GraphMailbox[]): WorkflowGraph {
  return layoutGraph(rawTemplate(template, mailboxes));
}

export function flowHandle(handle: string | null | undefined): SourceHandle {
  return handle && isSourceHandle(handle) ? handle : "out";
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
