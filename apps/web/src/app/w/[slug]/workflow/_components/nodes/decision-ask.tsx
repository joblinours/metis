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
import { Field, FieldDescription, FieldLabel } from "@metis/ui/components/field";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { WfKindNode, WfNode } from "@/workflow/graph";
import { nodeOutputs } from "@/workflow/kinds";
import {
  DECISION_STATE_FIELDS,
  type DecisionQuestion,
  type DecisionQuestionType,
  type DecisionStateField,
} from "@/workflow/schema";

import { DecisionPreviewSheet } from "./decision-preview-sheet";
import {
  newQuestion,
  nextId,
  QUESTION_TYPE_OPTIONS,
  QuestionEditor,
} from "./decision-question-editor";
import { NodeFrame, usePatchNode, useStoreGraph } from "./node-frame";

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

export function DecisionAskNode({ id, data }: NodeProps<WfKindNode<"decision.ask">>) {
  const { deleteElements } = useReactFlow<WfNode>();
  const node = data.node;
  const patch = usePatchNode(id, node);
  const graph = useStoreGraph();
  const [pending, setPending] = useState<{
    questions: DecisionQuestion[];
    edgeIds: string[];
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const setQuestions = (questions: DecisionQuestion[]) => {
    const next = {
      nodes: graph.nodes.map((n) => (n.id === id ? { ...node, questions } : n)),
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

  const addQuestion = (type: DecisionQuestionType) =>
    patch({
      questions: [
        ...node.questions,
        newQuestion(
          type,
          nextId(
            "q",
            node.questions.map((q) => q.id),
            1,
          ),
        ),
      ],
    });

  const toggleField = (field: DecisionStateField, on: boolean) => {
    const fields = on
      ? DECISION_STATE_FIELDS.filter((f) => f === field || node.state.fields.includes(f))
      : node.state.fields.filter((f) => f !== field);
    if (fields.length > 0) patch({ state: { fields } });
  };

  return (
    <NodeFrame id={id} node={node}>
      <Field className="gap-1">
        <FieldLabel className="text-xs">Send to the model</FieldLabel>
        <div className="grid grid-cols-2 gap-1">
          {DECISION_STATE_FIELDS.map((field) => (
            <Field key={field} orientation="horizontal" className="nodrag gap-1.5">
              <Checkbox
                id={`${id}-${field}`}
                checked={node.state.fields.includes(field)}
                onCheckedChange={(on) => toggleField(field, on)}
              />
              <FieldLabel
                htmlFor={`${id}-${field}`}
                className="font-normal text-muted-foreground text-xs"
              >
                {STATE_FIELD_LABELS[field]}
              </FieldLabel>
            </Field>
          ))}
        </div>
      </Field>

      <Field className="gap-1.5">
        <FieldLabel className="text-xs">Questions</FieldLabel>
        {node.questions.length === 0 && (
          <FieldDescription className="text-xs">
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
        <div className="flex gap-1">
          {QUESTION_TYPE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="xs"
              className="nodrag flex-1 border-dashed"
              onClick={(e) => {
                e.stopPropagation();
                addQuestion(option.value);
              }}
            >
              <Plus /> {option.label}
            </Button>
          ))}
        </div>
        <FieldDescription className="text-[11px]">
          Phrase each question positively, state the whole rule and its tie-breaks, and keep answers
          few and distinct.
        </FieldDescription>
      </Field>

      <Button
        variant="outline"
        size="xs"
        className="nodrag"
        disabled={node.questions.length === 0}
        onClick={(e) => {
          e.stopPropagation();
          setPreviewOpen(true);
        }}
      >
        Try on recent mail
      </Button>

      {previewOpen && (
        <DecisionPreviewSheet
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          node={node}
          mailboxes={data.mailboxes}
        />
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
                void deleteElements({
                  edges: pending.edgeIds.map((edgeId) => ({ id: edgeId })),
                });
                patch({ questions: pending.questions });
                setPending(null);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NodeFrame>
  );
}
