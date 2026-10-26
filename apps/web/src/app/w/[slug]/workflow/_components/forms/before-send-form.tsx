"use client";

import { Field, FieldLabel } from "@metis/ui/components/field";

import { useEditorEnv } from "../editor-context";
import { FormSelect } from "./form-select";
import type { StepFormProps } from "./types";

export function BeforeSendForm({ node, patch }: StepFormProps<"trigger.beforeSend">) {
  const { mailboxes } = useEditorEnv();
  return (
    <Field>
      <FieldLabel htmlFor="step-applies">Applies to mail sent from</FieldLabel>
      <FormSelect
        id="step-applies"
        value={node.mailboxId ?? ""}
        onValueChange={(mailboxId) => patch({ mailboxId: mailboxId || undefined })}
        options={[
          { value: "", label: "Any mailbox" },
          ...mailboxes.map((m) => ({ value: m.mailboxId, label: m.email })),
        ]}
      />
    </Field>
  );
}
