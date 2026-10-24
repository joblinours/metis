"use client";

import { FieldDescription } from "@metis/ui/components/field";
import type { NodeProps } from "@xyflow/react";

import type { WfNode } from "@/workflow/graph";

import { NodeFrame } from "./node-frame";

export function TriggerManualNode({ id, data }: NodeProps<WfNode>) {
  return (
    <NodeFrame id={id} node={data.node}>
      <FieldDescription className="text-xs">Runs only when you press Run now.</FieldDescription>
    </NodeFrame>
  );
}
