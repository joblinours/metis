"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { useEffect } from "react";

import type { WfData, WfNode } from "@/workflow/graph";
import {
  MAX_MERGE_INPUTS,
  type MergeKind,
  mergeInputHandle,
  mergeInputIndex,
  type WorkflowNode,
} from "@/workflow/schema";

import { NodeSelect } from "../node-select";

const handleClass = "!size-2 !border-border !bg-muted-foreground";

const MERGE_MODE_OPTIONS: { value: MergeKind; label: string }[] = [
  { value: "merge.append", label: "Pass on each input's mail" },
  { value: "merge.join", label: "Wait for every input" },
];

export function MergeInputHandles({ nodeId }: { nodeId: string }) {
  const highest = useStore((s) =>
    s.edges.reduce(
      (max, edge) =>
        edge.target === nodeId ? Math.max(max, mergeInputIndex(edge.targetHandle)) : max,
      -1,
    ),
  );
  const count = Math.min(MAX_MERGE_INPUTS, Math.max(2, highest + 2));
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(nodeId);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- React Flow must re-measure handles when the port count changes
  }, [count, nodeId, updateNodeInternals]);

  return Array.from({ length: count }, (_, index) => (
    <Handle
      key={index}
      type="target"
      id={mergeInputHandle(index)}
      position={Position.Top}
      style={{ left: `${((index + 1) / (count + 1)) * 100}%` }}
      title={`Input ${index + 1} · mail`}
      className={handleClass}
    />
  ));
}

export function MergeSettings({
  id,
  data,
  node,
}: {
  id: string;
  data: WfData;
  node: Extract<WorkflowNode, { kind: MergeKind }>;
}) {
  const { updateNode } = useReactFlow<WfNode>();
  const kind = node.kind;
  const count = useStore((s) => s.edges.filter((edge) => edge.target === id).length);
  const plural = count === 1 ? "" : "s";
  return (
    <>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Mode</FieldLabel>
        <NodeSelect
          value={kind}
          onValueChange={(next) =>
            updateNode(id, {
              type: next,
              data: {
                ...data,
                node: { ...node, kind: next },
              },
            })
          }
          options={MERGE_MODE_OPTIONS}
        />
      </Field>
      <p className="text-xs">
        {count === 0
          ? "Connect the branches to combine"
          : kind === "merge.join"
            ? `Waiting for ${count} input${plural}, then passing their mail on in input order`
            : `Combining ${count} input${plural}, in input order`}
      </p>
      <FieldDescription className="text-[11px]">
        {kind === "merge.join"
          ? "Accepts mail only. Nothing continues until every input that ran in this run has finished; an input that finds nothing counts as finished, one that fails or is blocked anywhere along its path — even before a Combine step — holds everything."
          : "Accepts mail only. A message that reaches here by more than one path is acted on once."}
      </FieldDescription>
    </>
  );
}
