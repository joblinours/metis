"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import { Checkbox } from "@metis/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@metis/ui/components/field";
import { Plus } from "lucide-react";
import { useState } from "react";

import { nodeOutputs } from "@/workflow/kinds";
import {
  DECISION_STATE_FIELDS,
  type DecisionQuestion,
  type DecisionStateField,
} from "@/workflow/schema";

import { useEditorStore } from "../editor-store";
import { DecisionPreviewSheet } from "./decision-preview-sheet";
import { newQuestion, nextId, QUESTION_TYPE_OPTIONS, QuestionEditor } from "./question-editor";
import type { StepFormProps } from "./types";

const STATE_FIELD_LABELS: Record<DecisionStateField, string> = {
  from: "Sender",
  to: "To",
  cc: "Cc",
  subject: "Subject",
  snippet: "Snippet",
  body: "Body",
  hasAttachment: "Has attachment",
  date: "Date",
};

export function AskForm({ node, patch }: StepFormProps<"decision.ask">) {
  const store = useEditorStore();
  const [pending, setPending] = useState<{
    questions: DecisionQuestion[];
    edgeIds: string[];
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setQuestions = (questions: DecisionQuestion[]) => {
    const { graph } = store.getState();
    const next = {
      nodes: graph.nodes.map((n) => (n.id === node.id ? { ...node, questions } : n)),
      edges: graph.edges,
    };
    const stale = next.edges.filter((edge) => {
      const source = next.nodes.find((n) => n.id === edge.source);
      return source && !nodeOutputs(source, next).some((o) => o.id === edge.sourceHandle);
    });
    if (stale.length > 0) {
      setPending({ questions, edgeIds: stale.map((e) => e.id) });
      return;
    }
    patch({ questions });
  };

  const toggleField = (field: DecisionStateField, on: boolean) => {
    const fields = on
      ? DECISION_STATE_FIELDS.filter((f) => f === field || node.state.fields.includes(f))
      : node.state.fields.filter((f) => f !== field);
    if (fields.length > 0) patch({ state: { fields } });
  };

  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Send to the model</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {DECISION_STATE_FIELDS.map((field) => (
            <Field key={field} orientation="horizontal" className="gap-2">
              <Checkbox
                id={`ask-${field}`}
                checked={node.state.fields.includes(field)}
                onCheckedChange={(on) => toggleField(field, on)}
              />
              <FieldLabel htmlFor={`ask-${field}`} className="font-normal">
                {STATE_FIELD_LABELS[field]}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Questions</FieldLegend>
        {node.questions.length === 0 && (
          <FieldDescription>
            Add a question. All of them are asked in one call per message.
          </FieldDescription>
        )}
        {node.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={index}
            onChange={(next) =>
              setQuestions(node.questions.map((q) => (q.id === next.id ? next : q)))
            }
            onRemove={() => setQuestions(node.questions.filter((q) => q.id !== question.id))}
          />
        ))}
        <div className="flex gap-1.5">
          {QUESTION_TYPE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              className="flex-1 border-dashed"
              onClick={() =>
                patch({
                  questions: [
                    ...node.questions,
                    newQuestion(
                      option.value,
                      nextId(
                        "q",
                        node.questions.map((q) => q.id),
                        1,
                      ),
                    ),
                  ],
                })
              }
            >
              <Plus /> {option.label}
            </Button>
          ))}
        </div>
        <FieldDescription>
          Phrase each question positively, state the whole rule and its tie-breaks, and keep answers
          few and distinct.
        </FieldDescription>
      </FieldSet>

      <Button
        variant="outline"
        disabled={node.questions.length === 0}
        onClick={() => setPreviewOpen(true)}
      >
        Try on recent mail
      </Button>

      {previewOpen && (
        <DecisionPreviewSheet open={previewOpen} onOpenChange={setPreviewOpen} node={node} />
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove connections?</AlertDialogTitle>
            <AlertDialogDescription>
              This change removes {pending?.edgeIds.length ?? 0} connection(s) that use a question
              or answer that no longer exists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pending) return;
                const gone = new Set(pending.edgeIds);
                store.getState().setGraph((graph) => ({
                  nodes: graph.nodes.map((n) =>
                    n.id === node.id ? { ...node, questions: pending.questions } : n,
                  ),
                  edges: graph.edges.filter((e) => !gone.has(e.id)),
                }));
                setPending(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
