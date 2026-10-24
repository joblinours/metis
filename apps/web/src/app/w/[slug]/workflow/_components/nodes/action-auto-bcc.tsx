"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { NodeFrame, usePatchNode } from "./node-frame";

export function ActionAutoBccNode({ id, data }: NodeProps<WfKindNode<"action.autoBcc">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">BCC address</FieldLabel>
        <Input
          type="email"
          value={node.address}
          onChange={(e) => patch({ address: e.target.value })}
          placeholder="archive@example.com"
          className="nodrag h-7 text-xs"
        />
      </Field>
    </NodeFrame>
  );
}
