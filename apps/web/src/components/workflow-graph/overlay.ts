import { stepState, worstStatus } from "@/components/workflow-history/run-status";
import type { TestWorkflowOutput, WorkflowRunDetail } from "@/server/schema";
import type { GraphShape, StepStatus } from "@/workflow/schema";
import { isTriggerStep } from "@/workflow/steps";

import type { CardStatus } from "./node-card";

export interface OverlayItem {
  id: string;
  status: StepStatus;
  title: string | null;
  subtitle: string | null;
  outputs: string[];
  detail: string | null;
  error: string | null;
  input: unknown;
  output: unknown;
}

export interface NodeOverlay {
  status: CardStatus;
  items: OverlayItem[];
}

export interface EdgeOverlay {
  taken: boolean;
  count: number | null;
}

export interface GraphOverlay {
  nodes: Map<string, NodeOverlay>;
  edges: Map<string, EdgeOverlay>;
}

const ATTENTION = new Set<StepStatus>(["failed", "blocked", "unknown"]);

function itemsOn(items: OverlayItem[], handle: string): number {
  return items.filter((item) => item.outputs.includes(handle)).length;
}

export function runOverlay(run: WorkflowRunDetail): GraphOverlay {
  const nodes = new Map<string, NodeOverlay>();
  const byId = new Map(run.nodes.map((node) => [node.nodeId, node]));

  for (const graphNode of run.graph.nodes) {
    const detail = byId.get(graphNode.id);
    const state = stepState(detail);
    const items: OverlayItem[] = (detail?.items ?? [])
      .filter((item) => !item.inputs)
      .map((item) => ({
        id: item.id,
        status: item.status,
        title: item.title,
        subtitle: item.subtitle,
        outputs: item.outputs ?? [],
        detail: item.detail,
        error: item.error,
        input: item.input,
        output: item.output,
      }));
    const trouble =
      state.status && ATTENTION.has(state.status)
        ? (items.find((item) => item.error)?.error ??
          detail?.lines.find((line) => line.detail)?.detail ??
          null)
        : state.status === "skipped" || state.status === "waiting"
          ? (items.find((item) => item.detail)?.detail ??
            detail?.lines.find((line) => line.detail)?.detail ??
            null)
          : null;
    nodes.set(graphNode.id, {
      status: { status: state.status, count: items.length, detail: trouble },
      items,
    });
  }

  const edges = new Map<string, EdgeOverlay>();
  for (const edge of run.graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const reached = stepState(source).taken && stepState(target).taken;
    const carried =
      source?.outputs.find((entry) => entry.handle === edge.sourceHandle)?.carried ?? true;
    const sourceItems = nodes.get(edge.source)?.items ?? [];
    edges.set(edge.id, {
      taken: reached && carried,
      count: sourceItems.length > 0 ? itemsOn(sourceItems, edge.sourceHandle) : null,
    });
  }

  return { nodes, edges };
}

export function testOverlay(graph: GraphShape, result: TestWorkflowOutput): GraphOverlay {
  const nodes = new Map<string, NodeOverlay>();
  for (const graphNode of graph.nodes) {
    const lines = result.steps.filter((step) => step.nodeId === graphNode.id);
    const items: OverlayItem[] = result.items
      .filter((item) => item.nodeId === graphNode.id)
      .map((item, index) => ({
        id: `${graphNode.id}:${index}`,
        status: item.status,
        title: item.title,
        subtitle: item.subtitle,
        outputs: item.outputs,
        detail: item.detail,
        error: item.error,
        input: item.input,
        output: item.result,
      }));
    const status =
      isTriggerStep(graphNode.step) && lines.length + items.length > 0
        ? "completed"
        : worstStatus([...lines.map((line) => line.status), ...items.map((item) => item.status)]);
    const trouble =
      status && (ATTENTION.has(status) || status === "skipped" || status === "waiting")
        ? (items.find((item) => item.error)?.error ??
          lines.find((line) => line.detail)?.detail ??
          items.find((item) => item.detail)?.detail ??
          null)
        : null;
    nodes.set(graphNode.id, {
      status: { status, count: items.length, detail: trouble },
      items,
    });
  }

  const edges = new Map<string, EdgeOverlay>();
  for (const edge of graph.edges) {
    const source = graph.nodes.find((node) => node.id === edge.source);
    const sourceItems = nodes.get(edge.source)?.items ?? [];
    const fired = source
      ? isTriggerStep(source.step) && nodes.get(source.id)?.status.status === "completed"
      : false;
    const count = itemsOn(sourceItems, edge.sourceHandle);
    edges.set(edge.id, {
      taken: fired || count > 0,
      count: fired && sourceItems.length === 0 ? null : count,
    });
  }

  return { nodes, edges };
}
