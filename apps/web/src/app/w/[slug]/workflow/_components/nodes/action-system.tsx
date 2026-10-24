"use client";

import { FieldDescription } from "@metis/ui/components/field";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { NodeFrame } from "./node-frame";

export function ActionSystemNode({ id, data }: NodeProps<WfKindNode<"action.system">>) {
  const node = data.node;
  return (
    <NodeFrame id={id} node={node}>
      <FieldDescription className="text-xs">{node.operation}</FieldDescription>
    </NodeFrame>
  );
}
