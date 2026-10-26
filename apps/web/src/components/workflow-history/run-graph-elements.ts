import type { Node } from "@xyflow/react";

import type { CardPort, CardStatus } from "@/components/workflow-graph/node-card";
import { nodePorts } from "@/components/workflow-graph/ports";
import type { WorkflowRunDetail } from "@/server/schema";
import { type CardContext, type CardLine, cardLines, nodeTitle } from "@/workflow/kinds";
import type { WorkflowNode } from "@/workflow/schema";

import type { GraphOverlay } from "../workflow-graph/overlay";
import { statusLabel } from "./run-status";

export interface RunGraphData extends Record<string, unknown> {
  node: WorkflowNode;
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
        ...nodePorts(node, run.graph, { spareInput: false }),
        lines: cardLines(node, ctx),
        status,
      },
    };
  });
}
