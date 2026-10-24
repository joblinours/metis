"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { cn } from "@metis/ui/lib/utils";
import type { NodeProps } from "@xyflow/react";
import { FolderPlus, Plus, X } from "lucide-react";

import type { WfKindNode } from "@/workflow/graph";
import { newPredicate } from "@/workflow/graph";
import type { PredicateNode, StringOp } from "@/workflow/schema";

import { NodeSelect } from "../node-select";
import { NodeFrame, usePatchNode } from "./node-frame";

const FIELD_OPTIONS = [
  { value: "from", label: "Sender" },
  { value: "to", label: "Recipient" },
  { value: "cc", label: "Cc" },
  { value: "subject", label: "Subject" },
  { value: "body", label: "Body" },
  { value: "hasAttachment", label: "Has attachment" },
] as const;

const OP_OPTIONS: { value: StringOp; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
];

const ATTACHMENT_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="nodrag"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <X />
    </Button>
  );
}

function PredicateEditor({
  node,
  onChange,
  onRemove,
  depth,
}: {
  node: PredicateNode;
  onChange: (next: PredicateNode) => void;
  onRemove?: () => void;
  depth: number;
}) {
  if (node.kind === "group") {
    return (
      <div
        className={cn("flex flex-col gap-1.5 rounded-md border p-1.5", depth > 0 && "bg-muted/40")}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Match</span>
          <NodeSelect
            value={node.logic}
            onValueChange={(logic) => onChange({ ...node, logic })}
            options={[
              { value: "all", label: "all" },
              { value: "any", label: "any" },
            ]}
            className="w-16"
          />
          <span className="flex-1 text-[10px] text-muted-foreground">of</span>
          {onRemove && <RemoveButton label="Remove group" onClick={onRemove} />}
        </div>

        {node.children.map((child, index) => (
          <PredicateEditor
            // oxlint-disable-next-line react/no-array-index-key --predicate children are positional
            key={index}
            node={child}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                ...node,
                children: node.children.map((c, i) => (i === index ? next : c)),
              })
            }
            onRemove={
              node.children.length > 1
                ? () =>
                    onChange({
                      ...node,
                      children: node.children.filter((_, i) => i !== index),
                    })
                : undefined
            }
          />
        ))}

        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="xs"
            className="nodrag flex-1 border-dashed"
            onClick={(e) => {
              e.stopPropagation();
              onChange({
                ...node,
                children: [...node.children, newPredicate()],
              });
            }}
          >
            <Plus /> Condition
          </Button>
          {depth < 3 && (
            <Button
              variant="outline"
              size="xs"
              className="nodrag flex-1 border-dashed"
              onClick={(e) => {
                e.stopPropagation();
                onChange({
                  ...node,
                  children: [
                    ...node.children,
                    { kind: "group", logic: "any", children: [newPredicate()] },
                  ],
                });
              }}
            >
              <FolderPlus /> Group
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isAttachment = node.field === "hasAttachment";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-1.5">
      <div className="flex items-center gap-1.5">
        <NodeSelect
          className="flex-1"
          value={node.field}
          onValueChange={(field) =>
            onChange(
              field === "hasAttachment"
                ? { kind: "predicate", field, op: "is", value: "true" }
                : { kind: "predicate", field, op: "contains", value: "" },
            )
          }
          options={FIELD_OPTIONS}
        />
        {onRemove && <RemoveButton label="Remove condition" onClick={onRemove} />}
      </div>

      {isAttachment ? (
        <NodeSelect
          value={node.value === "false" ? "false" : "true"}
          onValueChange={(value) =>
            onChange({
              kind: "predicate",
              field: "hasAttachment",
              op: "is",
              value,
            })
          }
          options={ATTACHMENT_OPTIONS}
        />
      ) : (
        <>
          <NodeSelect
            value={node.op}
            onValueChange={(op) => onChange({ ...node, op })}
            options={OP_OPTIONS}
          />
          <Input
            value={node.value}
            onChange={(e) => onChange({ ...node, value: e.target.value })}
            placeholder="value"
            className="nodrag h-7 text-xs"
          />
        </>
      )}
    </div>
  );
}

export function ConditionNode({ id, data }: NodeProps<WfKindNode<"condition">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  return (
    <NodeFrame id={id} node={node}>
      <PredicateEditor
        node={node.predicate}
        depth={0}
        onChange={(predicate) => patch({ predicate })}
      />
    </NodeFrame>
  );
}
