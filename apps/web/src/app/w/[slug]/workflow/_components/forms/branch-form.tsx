"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Slider } from "@metis/ui/components/slider";
import { useId } from "react";

import { branchQuestion } from "@/workflow/decision";

import { useEditor } from "../editor-store";
import type { StepFormProps } from "./types";

function ThresholdSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  return (
    <Field className="gap-2">
      <FieldLabel id={labelId} className="font-normal">
        {label} {Math.round(value * 100)}%
      </FieldLabel>
      <Slider
        aria-labelledby={labelId}
        min={0}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={(next) => {
          const raw = Array.isArray(next) ? next[0] : next;
          if (typeof raw === "number") onChange(raw / 100);
        }}
      />
    </Field>
  );
}

export function BranchForm({ node, patch }: StepFormProps<"decision.branch">) {
  const graph = useEditor((s) => s.graph);
  const asked = branchQuestion(graph, node.id);
  if (!asked) {
    return <FieldDescription>Connect this step to a question on an Ask step.</FieldDescription>;
  }
  const index = asked.ask.questions.findIndex((q) => q.id === asked.question.id);
  return (
    <>
      <p className="rounded-lg border border-border-soft bg-panel px-3 py-2 text-[13px]">
        <span className="text-muted-foreground">Q{index + 1}: </span>
        {asked.question.instructions || "(no question text yet)"}
      </p>
      {asked.question.type === "boolean" ? (
        <>
          <ThresholdSlider
            label="Yes when at least"
            value={node.yesAt}
            onChange={(yesAt) => patch({ yesAt })}
          />
          <ThresholdSlider
            label="No when at most"
            value={node.noAt}
            onChange={(noAt) => patch({ noAt })}
          />
        </>
      ) : (
        <ThresholdSlider
          label="Take the top answer at"
          value={node.minProbability}
          onChange={(minProbability) => patch({ minProbability })}
        />
      )}
      <FieldDescription>Anything below goes to Unsure.</FieldDescription>
    </>
  );
}
