import { type KindCheckContext, kindLabel, kindOf, nodeMailboxId, type PortType } from "./kinds";
import {
  DEFAULT_TARGET_HANDLE,
  isMergeKind,
  isTriggerKind,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  MAX_MERGE_INPUTS,
  MERGE_INPUT_PORT,
  mergeInputIndex,
  type WorkflowGraph,
  type WorkflowKind,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "./schema";

export type { PortType } from "./kinds";

export interface GraphError {
  nodeId?: string;
  message: string;
}

export interface ValidGraph {
  ok: true;
  order: string[];
  inputs: Map<string, PortType>;
  outputs: Map<string, PortType>;
  triggers: WorkflowNode[];
  mailboxIds: string[];
}

export type GraphValidation = ValidGraph | { ok: false; errors: GraphError[] };

export interface ValidateOptions {
  kind: WorkflowKind;
  allowedMailboxIds?: readonly string[];
  aiMailboxIds?: readonly string[];
  allowDecisionNodes?: boolean;
}

export function validateGraph(graph: WorkflowGraph, opts: ValidateOptions): GraphValidation {
  const errors: GraphError[] = [];
  const push = (message: string, nodeId?: string) => errors.push({ message, nodeId });

  if (graph.nodes.length > MAX_GRAPH_NODES) {
    push(`A workflow can hold at most ${MAX_GRAPH_NODES} steps`);
  }
  if (graph.edges.length > MAX_GRAPH_EDGES) {
    push(`A workflow can hold at most ${MAX_GRAPH_EDGES} connections`);
  }

  const byId = new Map<string, WorkflowNode>();
  const mailboxIds = new Set<string>();
  for (const node of graph.nodes) {
    if (byId.has(node.id)) push(`Duplicate step id "${node.id}"`, node.id);
    byId.set(node.id, node);
    const mailboxId = nodeMailboxId(node);
    if (mailboxId) mailboxIds.add(mailboxId);

    const { scope } = kindOf(node.kind);
    if (scope !== "any" && opts.kind === "user") {
      push(`"${node.kind}" is reserved for built-in workflows`, node.id);
    }
    if (scope === "system" && opts.kind !== "system") {
      push(`"${node.kind}" is reserved for maintenance workflows`, node.id);
    }
    if (node.skip && kindOf(node.kind).category !== "action") {
      push("Only an action step can be skipped", node.id);
    }
  }

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const seenEdges = new Set<string>();
  const usedPorts = new Set<string>();

  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      push("A connection points at a step that no longer exists", edge.target);
      continue;
    }
    if (edge.source === edge.target) {
      push("A step cannot connect to itself", edge.source);
      continue;
    }
    const key = `${edge.source}:${edge.sourceHandle}->${edge.target}`;
    if (seenEdges.has(key)) {
      push("Duplicate connection", edge.target);
      continue;
    }
    seenEdges.add(key);

    const sourceKind = kindOf(source.kind);
    const declared = sourceKind.outputs(source, graph).map((o) => o.id);
    if (!declared.includes(edge.sourceHandle)) {
      push(sourceKind.outputError, source.id);
    }

    if (isTriggerKind(target.kind)) {
      push("A trigger cannot receive a connection", target.id);
      continue;
    }

    const targetHandle = edge.targetHandle ?? DEFAULT_TARGET_HANDLE;
    if (isMergeKind(target.kind)) {
      const index = mergeInputIndex(targetHandle);
      if (index < 0) {
        push(
          `Connect each branch to one of this ${kindLabel(target.kind)} step's inputs (at most ${MAX_MERGE_INPUTS})`,
          target.id,
        );
        continue;
      }
      const port = `${target.id}:${index}`;
      if (usedPorts.has(port)) {
        push(
          `Two branches share one ${kindLabel(target.kind)} input. Give each its own.`,
          target.id,
        );
        continue;
      }
      usedPorts.add(port);
    } else if (targetHandle !== DEFAULT_TARGET_HANDLE) {
      push("Only a Combine or Wait for all step has numbered inputs", target.id);
      continue;
    }

    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  for (const [nodeId, sources] of incoming) {
    const target = byId.get(nodeId);
    if (sources.length > 1 && !(target && isMergeKind(target.kind))) {
      push(
        "This step receives more than one connection. Give it a single input, or add a Combine or Wait for all step to join branches.",
        nodeId,
      );
    }
  }

  const triggers = graph.nodes.filter((n) => isTriggerKind(n.kind));
  if (triggers.length === 0) {
    push("Start the workflow with a trigger");
  }

  const order: string[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  let cyclic = false;

  const visit = (id: string) => {
    const mark = state.get(id);
    if (mark === 1) {
      cyclic = true;
      return;
    }
    if (mark === 2) return;
    state.set(id, 1);
    for (const next of outgoing.get(id) ?? []) visit(next);
    state.set(id, 2);
    order.unshift(id);
  };

  for (const trigger of triggers) visit(trigger.id);
  if (cyclic) push("Workflow steps cannot loop back on themselves");

  const reachable = new Set(order);
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      push("This step is not connected to a trigger", node.id);
    }
  }

  const inputs = new Map<string, PortType>();
  const outputs = new Map<string, PortType>();

  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const sources = incoming.get(id) ?? [];

    if (isMergeKind(node.kind)) {
      const mismatched = sources
        .map((source) => outputs.get(source) ?? null)
        .find((type) => type !== MERGE_INPUT_PORT);
      if (mismatched !== undefined) {
        push(
          `Every input to a ${kindLabel(node.kind)} step must carry mail, but one carries ${mismatched ?? "no"} data`,
          id,
        );
      }
      inputs.set(id, MERGE_INPUT_PORT);
      outputs.set(id, MERGE_INPUT_PORT);
      continue;
    }

    const first = sources[0];
    const inbound = first ? (outputs.get(first) ?? null) : null;
    const kind = kindOf(node.kind);
    const needs = kind.input;

    if (needs && !inbound) {
      push(needs.missing, id);
    } else if (needs && needs.type !== "any" && inbound && needs.type !== inbound) {
      push(`This step works on ${needs.type} data but receives ${inbound} data`, id);
    }

    if (inbound) inputs.set(id, inbound);
    const declared = needs && needs.type !== "any" ? needs.type : null;
    outputs.set(id, kind.output(node, inbound ?? declared));
  }

  const triggerReach = new Map<string, Set<WorkflowNodeKind>>();
  for (const trigger of triggers) {
    const stack = [...(outgoing.get(trigger.id) ?? [])];
    const walked = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || walked.has(id)) continue;
      walked.add(id);
      const kinds = triggerReach.get(id) ?? new Set<WorkflowNodeKind>();
      kinds.add(trigger.kind);
      triggerReach.set(id, kinds);
      stack.push(...(outgoing.get(id) ?? []));
    }
  }

  const ctx: KindCheckContext = {
    graph,
    workflowKind: opts.kind,
    allowedMailboxIds: opts.allowedMailboxIds,
    aiMailboxIds: opts.aiMailboxIds,
    allowDecisionNodes: opts.allowDecisionNodes,
    byId,
    incoming: (nodeId) => [...(incoming.get(nodeId) ?? [])],
    outgoing: (nodeId) => [...(outgoing.get(nodeId) ?? [])],
    reachedBy: (nodeId) => triggerReach.get(nodeId) ?? new Set(),
  };

  for (const node of graph.nodes) {
    for (const message of kindOf(node.kind).check?.(node, ctx) ?? []) {
      push(message, node.id);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    order,
    inputs,
    outputs,
    triggers,
    mailboxIds: [...mailboxIds],
  };
}

export function outputPortOf(graph: WorkflowGraph, nodeId: string): PortType | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const walk = (id: string, seen: Set<string>): PortType | null => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return null;
    const kind = kindOf(node.kind);
    if (!kind.input || node.kind === "mailbox.source") {
      return kind.output(node, null);
    }
    if (isMergeKind(node.kind)) return "message";
    const source = graph.edges.find((e) => e.target === id)?.source;
    const inbound = source ? walk(source, new Set(seen).add(id)) : null;
    return inbound ? kind.output(node, inbound) : null;
  };
  return walk(nodeId, new Set());
}

export function firstError(validation: GraphValidation): string | null {
  if (validation.ok) return null;
  return validation.errors[0]?.message ?? "This workflow is incomplete.";
}
