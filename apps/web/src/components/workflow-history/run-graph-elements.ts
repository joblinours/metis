import type { Edge, Node } from "@xyflow/react";

import type { WorkflowRunDetail } from "@/server/schema";
import { edgeLabel, type KindOutput, kindLabel, nodeOutputs, outputLabel } from "@/workflow/kinds";
import type { WorkflowNodeKind } from "@/workflow/schema";
import { DEFAULT_TARGET_HANDLE, mergeInputIndex } from "@/workflow/schema";

import { type StepState, stepState } from "./run-status";

export interface RunGraphData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  mailbox: string | null;
  state: StepState;
  itemCount: number;
  inputPorts: number;
  outputs: KindOutput[];
}

export type RunGraphNode = Node<RunGraphData, "run">;

const RUN_ROW = 140;

const takenEdge = "[&_.react-flow__edge-path]:!stroke-primary [&_.react-flow__edge-path]:!stroke-2";
const idleEdge =
  "[&_.react-flow__edge-path]:!stroke-border [&_.react-flow__edge-path]:[stroke-dasharray:4_4]";

export function buildRunNodes(
  run: WorkflowRunDetail,
  mailboxLabel: (id: string | null) => string | null,
  selectedId: string | null,
): RunGraphNode[] {
  const byId = new Map(run.nodes.map((node) => [node.nodeId, node]));
  const rows = [...new Set(run.graph.nodes.map((node) => node.position.y))].toSorted(
    (a, b) => a - b,
  );
  return run.graph.nodes.map((node) => {
    const detail = byId.get(node.id);
    const state = stepState(detail);
    const mailbox = mailboxLabel(detail?.mailboxId ?? null);
    const itemCount = detail?.items.filter((item) => !item.inputs).length ?? 0;
    const highest = run.graph.edges.reduce(
      (max, edge) =>
        edge.target === node.id ? Math.max(max, mergeInputIndex(edge.targetHandle)) : max,
      -1,
    );
    return {
      id: node.id,
      type: "run",
      position: {
        x: node.position.x,
        y: rows.indexOf(node.position.y) * RUN_ROW,
      },
      selected: node.id === selectedId,
      draggable: false,
      connectable: false,
      deletable: false,
      ariaLabel: `${kindLabel(node.kind)}${mailbox ? `, ${mailbox}` : ""}: ${state.label}`,
      data: {
        kind: node.kind,
        mailbox,
        state,
        itemCount,
        inputPorts: highest + 1,
        outputs: nodeOutputs(node, run.graph),
      },
    };
  });
}

type RunNode = WorkflowRunDetail["nodes"][number];

type GraphEdge = WorkflowRunDetail["graph"]["edges"][number];

function edgeTaken(edge: GraphEdge, byId: Map<string, RunNode>): boolean {
  const source = byId.get(edge.source);
  const target = byId.get(edge.target);
  if (!stepState(source).taken || !stepState(target).taken) return false;
  return source?.outputs.find((entry) => entry.handle === edge.sourceHandle)?.carried ?? true;
}

export function buildRunEdges(run: WorkflowRunDetail): Edge[] {
  const byId = new Map(run.nodes.map((node) => [node.nodeId, node]));
  return run.graph.edges.map((edge) => {
    const used = edgeTaken(edge, byId);
    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle:
        edge.targetHandle && edge.targetHandle !== DEFAULT_TARGET_HANDLE ? edge.targetHandle : null,
      type: "smoothstep",
      label: outputLabel(run.graph, edge),
      ariaLabel: edgeLabel(run.graph, edge),
      className: used ? takenEdge : idleEdge,
      zIndex: used ? 1 : 0,
      data: { taken: used },
      deletable: false,
      focusable: false,
      selectable: false,
      reconnectable: false,
    };
  });
}
