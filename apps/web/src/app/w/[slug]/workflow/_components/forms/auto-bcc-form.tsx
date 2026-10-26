"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";

import type { StepFormProps } from "./types";

export function AutoBccForm({ node, patch }: StepFormProps<"action.autoBcc">) {
  return (
    <Field>
      <FieldLabel htmlFor="step-bcc">Bcc address</FieldLabel>
      <Input
        id="step-bcc"
        type="email"
        value={node.address}
        onChange={(e) => patch({ address: e.target.value })}
        placeholder="archive@example.com"
      />
      <FieldDescription>
        Added to every message this step sees, unless it is already a recipient.
      </FieldDescription>
    </Field>
  );
}
