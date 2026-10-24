"use client";

import { type Edge, useReactFlow } from "@xyflow/react";

import type { GraphMailbox, WfNode } from "@/workflow/graph";
import { newNode } from "@/workflow/graph";
import type { WorkflowNodeKind } from "@/workflow/schema";

export function useWorkflowActions() {
  const rf = useReactFlow<WfNode>();

  function addNode(kind: WorkflowNodeKind, mailboxes: GraphMailbox[]) {
    const existing = rf.getNodes();
    const lowest = existing.reduce((max, n) => Math.max(max, n.position.y), -170);
    const node = newNode(
      kind,
      { x: existing.length % 2 === 0 ? 0 : 300, y: lowest + 170 },
      mailboxes,
    );
    rf.addNodes([
      {
        id: node.id,
        type: kind,
        position: node.position,
        data: { node, mailboxes },
      },
    ]);
    return node.id;
  }

  function removeNode(id: string) {
    void rf.deleteElements({ nodes: [{ id }] });
  }

  function removeEdge(edge: Edge) {
    void rf.deleteElements({ edges: [{ id: edge.id }] });
  }

  return { addNode, removeNode, removeEdge };
}
