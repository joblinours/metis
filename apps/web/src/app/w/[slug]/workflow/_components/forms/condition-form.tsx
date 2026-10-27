"use client";

import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import { cn } from "@metis/ui/lib/utils";
import { FolderPlus, Plus, X } from "lucide-react";

import { newPredicate } from "@/workflow/graph";
import { PREDICATE_FIELD_LABELS, STRING_OP_LABELS } from "@/workflow/kinds/condition";
import {
  PREDICATE_FIELDS,
  type PredicateNode,
  STRING_OPS,
  MAX_PREDICATE_DEPTH,
} from "@/workflow/schema";

import { FormSelect } from "./form-select";
import type { StepFormProps } from "./types";

const FIELD_OPTIONS = PREDICATE_FIELDS.map((value) => ({
  value,
  label: PREDICATE_FIELD_LABELS[value],
}));

const OP_OPTIONS = STRING_OPS.map((value) => ({ value, label: STRING_OP_LABELS[value] }));

const ATTACHMENT_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
] as const;

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
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-border p-2",
          depth > 0 && "bg-panel",
        )}
      >
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Match</span>
          <FormSelect
            label="Match"
            value={node.logic}
            onValueChange={(logic) => onChange({ ...node, logic })}
            options={[
              { value: "all", label: "all" },
              { value: "any", label: "any" },
            ]}
            className="w-20"
          />
          <span className="flex-1 text-muted-foreground">of these</span>
          {onRemove && (
            <Button variant="ghost" size="icon-sm" aria-label="Remove group" onClick={onRemove}>
              <X />
            </Button>
          )}
        </div>

        {node.children.map((child, index) => (
          <PredicateEditor
            // oxlint-disable-next-line react/no-array-index-key -- predicate children are positional
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
                ? () => onChange({ ...node, children: node.children.filter((_, i) => i !== index) })
                : undefined
            }
          />
        ))}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-dashed"
            onClick={() => onChange({ ...node, children: [...node.children, newPredicate()] })}
          >
            <Plus /> Condition
          </Button>
          {depth < MAX_PREDICATE_DEPTH - 2 && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 border-dashed"
              onClick={() =>
                onChange({
                  ...node,
                  children: [
                    ...node.children,
                    { kind: "group", logic: "any", children: [newPredicate()] },
                  ],
                })
              }
            >
              <FolderPlus /> Group
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2">
      <div className="flex items-center gap-2">
        <FormSelect
          label="Field"
          value={node.field}
          onValueChange={(field) =>
            onChange(
              field === "hasAttachment"
                ? { kind: "predicate", field, op: "is", value: "true" }
                : {
                    kind: "predicate",
                    field,
                    op: node.field === "hasAttachment" ? "contains" : node.op,
                    value: node.field === "hasAttachment" ? "" : node.value,
                  },
            )
          }
          options={FIELD_OPTIONS}
          className="flex-1"
        />
        {onRemove && (
          <Button variant="ghost" size="icon-sm" aria-label="Remove condition" onClick={onRemove}>
            <X />
          </Button>
        )}
      </div>

      {node.field === "hasAttachment" ? (
        <FormSelect
          label="Has attachment"
          value={node.value === "false" ? "false" : "true"}
          onValueChange={(value) =>
            onChange({ kind: "predicate", field: "hasAttachment", op: "is", value })
          }
          options={ATTACHMENT_OPTIONS}
        />
      ) : (
        <div className="flex gap-2">
          <FormSelect
            label="Comparison"
            value={node.op}
            onValueChange={(op) => onChange({ ...node, op })}
            options={OP_OPTIONS}
            className="w-32 shrink-0"
          />
          <Input
            className="text-[13px]"
            aria-label="Value"
            value={node.value}
            onChange={(e) => onChange({ ...node, value: e.target.value })}
            placeholder="value"
          />
        </div>
      )}
    </div>
  );
}

export function ConditionForm({ node, patch }: StepFormProps<"condition">) {
  return (
    <PredicateEditor
      node={node.predicate}
      depth={0}
      onChange={(predicate) => patch({ predicate })}
    />
  );
}
