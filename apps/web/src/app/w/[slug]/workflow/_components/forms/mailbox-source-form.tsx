"use client";

import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";

import { MAIL_FOLDERS } from "@/types/mail";

import { useEditorEnv } from "../editor-context";
import { FormSelect } from "./form-select";
import type { StepFormProps } from "./types";

const OPERATION_OPTIONS = [
  { value: "incoming", label: "Newly arrived mail" },
  { value: "list", label: "A folder or search" },
] as const;

const FOLDER_OPTIONS = MAIL_FOLDERS.map((value) => ({
  value,
  label: `${value[0]?.toUpperCase()}${value.slice(1)}`,
}));

export function MailboxSourceForm({ node, patch }: StepFormProps<"mailbox.source">) {
  const { mailboxes } = useEditorEnv();
  return (
    <>
      <Field>
        <FieldLabel htmlFor="source-mailbox">Mailbox</FieldLabel>
        {mailboxes.length === 0 ? (
          <FieldDescription>Connect a mailbox to this workspace first.</FieldDescription>
        ) : (
          <FormSelect
            id="source-mailbox"
            value={node.mailboxId}
            onValueChange={(mailboxId) => patch({ mailboxId })}
            options={mailboxes.map((m) => ({ value: m.mailboxId, label: m.email }))}
          />
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="source-operation">Provides</FieldLabel>
        <FormSelect
          id="source-operation"
          value={node.operation === "list" ? "list" : "incoming"}
          onValueChange={(operation) => patch({ operation })}
          options={OPERATION_OPTIONS}
        />
        <FieldDescription>
          {node.operation === "list"
            ? "Reads the folder or search each time the workflow runs."
            : "Only runs under a When mail arrives trigger, one message at a time."}
        </FieldDescription>
      </Field>
      {node.operation === "list" && (
        <>
          <Field>
            <FieldLabel htmlFor="source-folder">Folder</FieldLabel>
            <FormSelect
              id="source-folder"
              value={node.folder}
              onValueChange={(folder) => patch({ folder })}
              options={FOLDER_OPTIONS}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="source-query">Search (optional)</FieldLabel>
            <Input
              id="source-query"
              value={node.query ?? ""}
              onChange={(e) => patch({ query: e.target.value || undefined })}
              placeholder="from:billing@"
            />
            <FieldDescription>A search replaces the folder.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="source-limit">Take at most</FieldLabel>
            <Input
              id="source-limit"
              type="number"
              min={1}
              max={100}
              value={node.limit}
              onChange={(e) =>
                patch({ limit: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })
              }
            />
          </Field>
        </>
      )}
    </>
  );
}
