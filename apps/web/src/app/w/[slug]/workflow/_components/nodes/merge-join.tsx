"use client";

import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { MergeInputHandles, MergeSettings } from "./merge-inputs";
import { NodeFrame } from "./node-frame";

export function MergeJoinNode({ id, data }: NodeProps<WfKindNode<"merge.join">>) {
  return (
    <NodeFrame id={id} node={data.node} inputs={<MergeInputHandles nodeId={id} />}>
      <MergeSettings id={id} data={data} node={data.node} />
    </NodeFrame>
  );
}
