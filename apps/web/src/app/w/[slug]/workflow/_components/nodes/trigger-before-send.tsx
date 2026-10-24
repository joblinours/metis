"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import type { NodeProps } from "@xyflow/react";

import type { WfKindNode } from "@/workflow/graph";

import { NodeSelect } from "../node-select";
import { NodeFrame, usePatchNode } from "./node-frame";

export function TriggerBeforeSendNode({ id, data }: NodeProps<WfKindNode<"trigger.beforeSend">>) {
  const { mailboxes } = data;
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Applies to</FieldLabel>
        <NodeSelect
          value={node.mailboxId ?? ""}
          onValueChange={(mailboxId) => patch({ mailboxId: mailboxId || undefined })}
          options={[
            { value: "", label: "Any mailbox" },
            ...mailboxes.map((m) => ({ value: m.mailboxId, label: m.email })),
          ]}
        />
      </Field>
    </NodeFrame>
  );
}
