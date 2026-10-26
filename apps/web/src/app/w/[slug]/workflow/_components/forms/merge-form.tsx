"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";

import type { MergeKind } from "@/workflow/schema";

import { useEditor } from "../editor-store";
import { FormSelect } from "./form-select";
import type { StepFormProps } from "./types";

const MODE_OPTIONS: { value: MergeKind; label: string }[] = [
  { value: "merge.append", label: "Pass on each input's mail" },
  { value: "merge.join", label: "Wait for every input" },
];

export function MergeForm({ node, replace }: Pick<StepFormProps<MergeKind>, "node" | "replace">) {
  const count = useEditor((s) => s.graph.edges.filter((e) => e.target === node.id).length);
  const plural = count === 1 ? "" : "s";
  return (
    <>
      <Field>
        <FieldLabel htmlFor="merge-mode">Mode</FieldLabel>
        <FormSelect
          id="merge-mode"
          value={node.kind}
          onValueChange={(kind) => replace({ ...node, kind })}
          options={MODE_OPTIONS}
        />
      </Field>
      <p className="text-[13px]">
        {count === 0
          ? "Connect the branches to combine."
          : node.kind === "merge.join"
            ? `Waits for ${count} input${plural}, then passes their mail on in input order.`
            : `Combines ${count} input${plural}, in input order.`}
      </p>
      <FieldDescription>
        {node.kind === "merge.join"
          ? "Accepts mail only. Nothing continues until every input that ran in this run has finished; an input that finds nothing counts as finished, one that fails or is blocked anywhere along its path holds everything."
          : "Accepts mail only. A message that reaches here by more than one path is acted on once."}
      </FieldDescription>
    </>
  );
}
