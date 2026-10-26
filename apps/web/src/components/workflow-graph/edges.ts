import type { Edge } from "@xyflow/react";

import { edgeLabel, type GraphShape, outputLabel } from "@/workflow/kinds";
import { DEFAULT_TARGET_HANDLE } from "@/workflow/schema";

import type { GraphOverlay } from "./overlay";

const takenEdge = "[&_.react-flow__edge-path]:!stroke-primary [&_.react-flow__edge-path]:!stroke-2";
const idleEdge =
  "[&_.react-flow__edge-path]:!stroke-border [&_.react-flow__edge-path]:[stroke-dasharray:4_4]";

export function flowEdges(
  graph: GraphShape,
  overlay: GraphOverlay | null,
  opts: { editable: boolean; animate?: boolean; selected?: ReadonlySet<string> },
): Edge[] {
  return graph.edges.map((edge) => {
    const state = overlay?.edges.get(edge.id);
    const output = outputLabel(graph, edge);
    const count = state?.count ?? null;
    const label = [output, count !== null ? String(count) : null].filter(Boolean).join(" · ");
    return {
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      targetHandle:
        edge.targetHandle && edge.targetHandle !== DEFAULT_TARGET_HANDLE ? edge.targetHandle : null,
      label: label || undefined,
      ariaLabel: edgeLabel(graph, edge),
      className: state ? (state.taken ? takenEdge : idleEdge) : undefined,
      animated: !!opts.animate && !!state?.taken,
      zIndex: state?.taken ? 1 : 0,
      selected: opts.selected?.has(edge.id) ?? false,
      deletable: opts.editable,
      focusable: opts.editable,
      selectable: opts.editable,
      reconnectable: false,
    };
  });
}
