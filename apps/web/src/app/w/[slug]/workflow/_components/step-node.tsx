"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { memo, useMemo } from "react";

import { NodeCard } from "@/components/workflow-graph/node-card";
import { nodePorts } from "@/components/workflow-graph/ports";
import { cardLines } from "@/workflow/kinds";
import type { WorkflowNode } from "@/workflow/schema";

import { useCardContext, useDiagnostics, useOverlay } from "./editor-context";
import { useEditor } from "./editor-store";

export type StepFlowNode = Node<{ node: WorkflowNode }, "step">;

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<StepFlowNode>) {
  const graph = useEditor((s) => s.graph);
  const removeNodes = useEditor((s) => s.removeNodes);
  const ctx = useCardContext(graph);
  const problems = useDiagnostics().byNode.get(id);
  const { overlay } = useOverlay();
  const ports = useMemo(
    () => nodePorts(data.node, graph, { spareInput: true }),
    [data.node, graph],
  );
  const lines = useMemo(() => cardLines(data.node, ctx), [data.node, ctx]);

  return (
    <NodeCard
      node={data.node}
      inputs={ports.inputs}
      outputs={ports.outputs}
      lines={lines}
      problem={problems?.[0] ?? null}
      status={overlay?.nodes.get(id)?.status ?? null}
      selected={selected}
      connectable
      onRemove={() => removeNodes([id])}
    />
  );
});
