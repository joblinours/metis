"use client";

import { Button } from "@metis/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@metis/ui/components/card";
import { cn } from "@metis/ui/lib/utils";
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { borderFor, iconFor, toneFor } from "@/components/workflow-node-meta";
import { flowHandle, type WfNode, wfData } from "@/workflow/graph";
import { type KindOutput, kindLabel, kindOf, nodeOutputs } from "@/workflow/kinds";
import type { WorkflowGraph, WorkflowNode } from "@/workflow/schema";

import { useWorkflowActions } from "../workflow-actions";

const handleClass = "!size-2 !border-border !bg-muted-foreground";

export function useStoreGraph(): Pick<WorkflowGraph, "nodes" | "edges"> {
  const snapshot = useStore((s) =>
    JSON.stringify({
      nodes: [...s.nodeLookup.values()].flatMap((n) => {
        const data = wfData(n.data);
        return data ? [data.node] : [];
      }),
      edges: s.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: flowHandle(e.sourceHandle),
      })),
    }),
  );
  return useMemo(() => JSON.parse(snapshot), [snapshot]);
}

export function usePatchNode<N extends WorkflowNode>(id: string, node: N) {
  const { updateNodeData } = useReactFlow<WfNode>();
  return (next: Partial<N>) => updateNodeData(id, { node: { ...node, ...next } as WorkflowNode });
}

function OutputHandles({ nodeId, outputs }: { nodeId: string; outputs: KindOutput[] }) {
  const updateNodeInternals = useUpdateNodeInternals();
  const key = outputs.map((o) => o.id).join("|");
  useEffect(() => {
    updateNodeInternals(nodeId);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- React Flow must re-measure handles when the output set changes
  }, [key, nodeId, updateNodeInternals]);

  const labelled = outputs.some((o) => o.label);
  if (!labelled) {
    return outputs.map((output) => (
      <Handle
        key={output.id}
        type="source"
        id={output.id}
        position={Position.Bottom}
        className={handleClass}
      />
    ));
  }
  const stagger = outputs.length > 3;
  return (
    <CardFooter className={cn("relative gap-0 border-t p-0", stagger ? "h-10" : "h-6")}>
      {outputs.map((output, index) => {
        const left = `${((index + 0.5) / outputs.length) * 100}%`;
        return (
          <span key={output.id}>
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-muted-foreground"
              style={{ left, top: stagger && index % 2 === 1 ? 18 : 6 }}
              title={output.label}
            >
              {output.label}
            </span>
            <Handle
              type="source"
              id={output.id}
              position={Position.Bottom}
              style={{ left }}
              className={handleClass}
            />
          </span>
        );
      })}
    </CardFooter>
  );
}

export function NodeFrame({
  id,
  node,
  inputs,
  children,
}: {
  id: string;
  node: WorkflowNode;
  inputs?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { removeNode } = useWorkflowActions();
  const graph = useStoreGraph();
  const outputs = nodeOutputs(node, graph);
  const takesInput = kindOf(node.kind).input !== null;

  return (
    <Card
      size="sm"
      className={cn("w-64 gap-0 overflow-visible py-0 ring-0", "border", borderFor(node.kind))}
    >
      {inputs ??
        (takesInput && <Handle type="target" position={Position.Top} className={handleClass} />)}
      <CardHeader
        className={cn("flex items-center gap-2 rounded-t-xl border-b py-2", toneFor(node.kind))}
      >
        {iconFor(node.kind)}
        <CardTitle className="min-w-0 flex-1 truncate text-xs">{kindLabel(node.kind)}</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-xs"
            className="nodrag"
            aria-label="Remove step"
            onClick={(e) => {
              e.stopPropagation();
              removeNode(id);
            }}
          >
            <X />
          </Button>
        </CardAction>
      </CardHeader>
      {children && <CardContent className="flex flex-col gap-2 py-2.5">{children}</CardContent>}
      <OutputHandles nodeId={id} outputs={outputs} />
    </Card>
  );
}
