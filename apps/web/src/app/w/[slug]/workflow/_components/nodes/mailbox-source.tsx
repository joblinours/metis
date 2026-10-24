"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import type { NodeProps } from "@xyflow/react";

import { MAIL_FOLDERS } from "@/types/mail";
import type { WfKindNode } from "@/workflow/graph";
import { MAILBOX_OPERATIONS } from "@/workflow/schema";

import { NodeSelect } from "../node-select";
import { NodeFrame, usePatchNode } from "./node-frame";

const OPERATION_OPTIONS = MAILBOX_OPERATIONS.filter(
  (value) => value === "incoming" || value === "list",
).map((value) => ({
  value,
  label: value === "incoming" ? "newly arrived mail" : "a folder or search",
}));

const FOLDER_OPTIONS = MAIL_FOLDERS.map((value) => ({
  value,
  label: value[0]?.toUpperCase() + value.slice(1),
}));

export function MailboxSourceNode({ id, data }: NodeProps<WfKindNode<"mailbox.source">>) {
  const { mailboxes } = data;
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Mailbox</FieldLabel>
        {mailboxes.length === 0 ? (
          <FieldDescription className="text-xs">Connect a mailbox first</FieldDescription>
        ) : (
          <NodeSelect
            value={node.mailboxId}
            onValueChange={(mailboxId) => patch({ mailboxId })}
            options={mailboxes.map((m) => ({
              value: m.mailboxId,
              label: m.email,
            }))}
          />
        )}
      </Field>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Provides</FieldLabel>
        <NodeSelect
          value={node.operation === "list" ? "list" : "incoming"}
          onValueChange={(operation) => patch({ operation })}
          options={OPERATION_OPTIONS}
        />
      </Field>
      {node.operation === "list" && (
        <>
          <Field className="gap-1">
            <FieldLabel className="text-xs">Folder</FieldLabel>
            <NodeSelect
              value={node.folder}
              onValueChange={(folder) => patch({ folder })}
              options={FOLDER_OPTIONS}
            />
          </Field>
          <Field className="gap-1">
            <FieldLabel className="text-xs">Search (optional)</FieldLabel>
            <Input
              value={node.query ?? ""}
              onChange={(e) => patch({ query: e.target.value || undefined })}
              placeholder="from:billing@"
              className="nodrag h-7 text-xs"
            />
          </Field>
          <Field className="gap-1">
            <FieldLabel className="text-xs">Take at most</FieldLabel>
            <Input
              type="number"
              min={1}
              max={100}
              value={node.limit}
              onChange={(e) => patch({ limit: Number(e.target.value) || 1 })}
              className="nodrag h-7 text-xs"
            />
          </Field>
        </>
      )}
    </NodeFrame>
  );
}
