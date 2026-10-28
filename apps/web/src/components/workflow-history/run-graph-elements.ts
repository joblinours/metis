import type { Node } from "@xyflow/react";

import type { CardPort, CardStatus } from "@/components/workflow-graph/node-card";
import { nodePorts } from "@/components/workflow-graph/ports";
import type { WorkflowRunDetail } from "@/server/schema";
import type { GraphNode } from "@/workflow/schema";
import { type CardContext, type CardLine, cardLines, nodeTitle } from "@/workflow/steps";
import { analyzeGraph } from "@/workflow/validation";

import type { GraphOverlay } from "../workflow-graph/overlay";
import { statusLabel } from "./run-status";

export interface RunGraphData extends Record<string, unknown> {
  node: GraphNode;
  inputs: CardPort[];
  outputs: CardPort[];
  lines: CardLine[];
  status: CardStatus;
}

export type RunGraphNode = Node<RunGraphData, "run">;

export function buildRunNodes(
  run: WorkflowRunDetail,
  overlay: GraphOverlay,
  ctx: CardContext,
  selectedId: string | null,
): RunGraphNode[] {
  const { types } = analyzeGraph(run.graph);
  return run.graph.nodes.map((node) => {
    const status = overlay.nodes.get(node.id)?.status ?? { status: null, count: 0, detail: null };
    const label = status.status === null ? "not reached" : statusLabel(status.status);
    return {
      id: node.id,
      type: "run",
      position: node.position,
      selected: node.id === selectedId,
      draggable: false,
      connectable: false,
      deletable: false,
      ariaLabel: `${nodeTitle(node)}: ${label}`,
      data: {
        node,
        ...nodePorts(node, run.graph, types, { spareInput: false }),
        lines: cardLines(node, ctx),
        status,
      },
    };
  });
}
