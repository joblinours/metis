"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";

import { useLabelOptions } from "../label-options";
import { FormSelect } from "./form-select";
import type { StepFormProps } from "./types";

export function LabelForm({ node, patch }: StepFormProps<"action.label">) {
  const options = useLabelOptions();
  return (
    <Field>
      <FieldLabel htmlFor="step-label">Label</FieldLabel>
      <FormSelect
        id="step-label"
        value={node.label}
        onValueChange={(label) => patch({ label })}
        options={options}
      />
    </Field>
  );
}
