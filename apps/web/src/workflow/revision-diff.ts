import type { Binding } from "./expr";
import type { GraphEdge, GraphNode, GraphShape, GraphSettings } from "./schema";
import { nodeTitle, stepDef } from "./steps";

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface NodeChange {
  nodeId: string;
  title: string;
  fields: FieldChange[];
}

export interface GraphDiff {
  added: { nodeId: string; title: string }[];
  removed: { nodeId: string; title: string }[];
  changed: NodeChange[];
  connected: string[];
  disconnected: string[];
  settings: FieldChange[];
}

const NONE = "—";

export function bindingText(binding: Binding | undefined): string {
  if (!binding) return NONE;
  if (binding.kind === "template") return binding.text || NONE;
  if (binding.kind === "expr") return binding.cel ? `= ${binding.cel}` : NONE;
  const { value } = binding;
  if (value === null || value === "") return NONE;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function paramLabel(node: GraphNode, name: string): string {
  return stepDef(node.step)?.params[name]?.label ?? name;
}

function nodeChanges(before: GraphNode, after: GraphNode): FieldChange[] {
  const fields: FieldChange[] = [];
  const push = (field: string, a: string, b: string) => {
    if (a !== b) fields.push({ field, before: a, after: b });
  };
  if (before.step !== after.step) push("Step", before.step, after.step);
  push("Title", before.title ?? NONE, after.title ?? NONE);
  push("Skipped", before.skip ? "yes" : "no", after.skip ? "yes" : "no");
  push("On error", before.onError ?? "stop", after.onError ?? "stop");
  const names = [...new Set([...Object.keys(before.params), ...Object.keys(after.params)])];
  for (const name of names) {
    push(
      paramLabel(after, name),
      bindingText(before.params[name]),
      bindingText(after.params[name]),
    );
  }
  return fields;
}

function edgeText(edge: GraphEdge, titleOf: (id: string) => string): string {
  const handle = edge.sourceHandle && edge.sourceHandle !== "out" ? ` (${edge.sourceHandle})` : "";
  return `${titleOf(edge.source)}${handle} → ${titleOf(edge.target)}`;
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\u0000${edge.sourceHandle}\u0000${edge.target}\u0000${edge.targetHandle ?? "in"}`;
}

function settingsChanges(before: GraphSettings, after: GraphSettings): FieldChange[] {
  const fields: FieldChange[] = [];
  const push = (field: string, a: string, b: string) => {
    if (a !== b) fields.push({ field, before: a, after: b });
  };
  push("Time zone", before.timezone ?? NONE, after.timezone ?? NONE);
  push("Runs at once", String(before.concurrency ?? NONE), String(after.concurrency ?? NONE));
  const limit = (settings: GraphSettings) =>
    settings.limit
      ? `${settings.limit.mode} ${settings.limit.seconds}s by ${settings.limit.key}`
      : NONE;
  push("Rate limit", limit(before), limit(after));
  return fields;
}

export function diffGraphs(
  before: GraphShape & { settings?: GraphSettings },
  after: GraphShape & { settings?: GraphSettings },
): GraphDiff {
  const old = new Map(before.nodes.map((node) => [node.id, node]));
  const next = new Map(after.nodes.map((node) => [node.id, node]));
  const titleOf = (id: string) => {
    const node = next.get(id) ?? old.get(id);
    return node ? nodeTitle(node) : id;
  };
  const oldEdges = new Map(before.edges.map((edge) => [edgeKey(edge), edge]));
  const newEdges = new Map(after.edges.map((edge) => [edgeKey(edge), edge]));
  return {
    added: after.nodes
      .filter((node) => !old.has(node.id))
      .map((node) => ({ nodeId: node.id, title: nodeTitle(node) })),
    removed: before.nodes
      .filter((node) => !next.has(node.id))
      .map((node) => ({ nodeId: node.id, title: nodeTitle(node) })),
    changed: after.nodes.flatMap((node) => {
      const previous = old.get(node.id);
      if (!previous) return [];
      const fields = nodeChanges(previous, node);
      return fields.length > 0 ? [{ nodeId: node.id, title: nodeTitle(node), fields }] : [];
    }),
    connected: [...newEdges]
      .filter(([key]) => !oldEdges.has(key))
      .map(([, edge]) => edgeText(edge, titleOf)),
    disconnected: [...oldEdges]
      .filter(([key]) => !newEdges.has(key))
      .map(([, edge]) => edgeText(edge, titleOf)),
    settings: settingsChanges(before.settings ?? {}, after.settings ?? {}),
  };
}

export function isEmptyDiff(diff: GraphDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0 &&
    diff.connected.length === 0 &&
    diff.disconnected.length === 0 &&
    diff.settings.length === 0
  );
}
