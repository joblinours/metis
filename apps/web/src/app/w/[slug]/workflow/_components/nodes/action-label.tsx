"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { useLabelOptions } from "../label-options";
import { NodeSelect } from "../node-select";
import { NodeFrame, usePatchNode } from "./node-frame";

export function ActionLabelNode({ id, data }: NodeProps<WfKindNode<"action.label">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  const options = useLabelOptions();
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Label</FieldLabel>
        <NodeSelect
          value={node.label}
          onValueChange={(label) => patch({ label })}
          options={options}
        />
      </Field>
    </NodeFrame>
  );
}
