"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { NodeFrame, usePatchNode } from "./node-frame";

const pad = (n: number) => String(n).padStart(2, "0");

function localDateTimeValue(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function TriggerOnceNode({ id, data }: NodeProps<WfKindNode<"trigger.once">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Fires at</FieldLabel>
        <Input
          type="datetime-local"
          value={localDateTimeValue(node.at)}
          onChange={(e) => patch({ at: new Date(e.target.value).toISOString() })}
          className="nodrag h-7 text-xs"
        />
      </Field>
    </NodeFrame>
  );
}
