"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";

import type { StepFormProps } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

function localDateTimeValue(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function OnceForm({ node, patch }: StepFormProps<"trigger.once">) {
  return (
    <Field>
      <FieldLabel htmlFor="step-at">Fires at</FieldLabel>
      <Input
        className="text-[13px]"
        id="step-at"
        type="datetime-local"
        value={localDateTimeValue(node.at)}
        onChange={(e) => {
          const at = new Date(e.target.value);
          if (!Number.isNaN(at.getTime())) patch({ at: at.toISOString() });
        }}
      />
    </Field>
  );
}
