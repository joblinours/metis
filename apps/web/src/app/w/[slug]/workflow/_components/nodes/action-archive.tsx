"use client";

import type { NodeProps } from "@xyflow/react";

import type { WfNode } from "@/workflow/graph";

import { NodeFrame } from "./node-frame";

export function ActionArchiveNode({ id, data }: NodeProps<WfNode>) {
  return <NodeFrame id={id} node={data.node} />;
}
