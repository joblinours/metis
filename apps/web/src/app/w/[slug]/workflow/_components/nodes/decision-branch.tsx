"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Slider } from "@metis/ui/components/slider";
import type { NodeProps } from "@xyflow/react";
import { useId } from "react";

import { branchQuestion } from "@/workflow/decision";
import type { WfKindNode } from "@/workflow/graph";

import { NodeFrame, usePatchNode, useStoreGraph } from "./node-frame";

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
    <Field className="nodrag gap-1.5">
      <FieldLabel id={labelId} className="font-normal text-muted-foreground text-xs">
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

export function DecisionBranchNode({ id, data }: NodeProps<WfKindNode<"decision.branch">>) {
  const node = data.node;
  const patch = usePatchNode(id, node);
  const graph = useStoreGraph();
  const asked = branchQuestion(graph, id);
  const index = asked ? asked.ask.questions.findIndex((q) => q.id === asked.question.id) : -1;

  return (
    <NodeFrame id={id} node={node}>
      {asked ? (
        <>
          <p className="line-clamp-2 text-xs">
            Q{index + 1}: {asked.question.instructions || "(no question text yet)"}
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
          <FieldDescription className="text-[11px]">
            Anything below goes to Unsure.
          </FieldDescription>
        </>
      ) : (
        <FieldDescription className="text-xs">
          Connect this to a question on an Ask step.
        </FieldDescription>
      )}
    </NodeFrame>
  );
}
