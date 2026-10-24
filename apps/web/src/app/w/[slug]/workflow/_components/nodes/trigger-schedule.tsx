"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { NodeFrame, usePatchNode } from "./node-frame";

export function TriggerScheduleNode({ id, data }: NodeProps<WfKindNode<"trigger.schedule">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Cron (5 fields)</FieldLabel>
        <Input
          value={node.cron}
          onChange={(e) => patch({ cron: e.target.value })}
          placeholder="0 9 * * 1-5"
          className="nodrag h-7 text-xs"
        />
      </Field>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Time zone</FieldLabel>
        <Input
          value={node.timezone}
          onChange={(e) => patch({ timezone: e.target.value })}
          placeholder="Europe/Berlin"
          className="nodrag h-7 text-xs"
        />
      </Field>
    </NodeFrame>
  );
}
