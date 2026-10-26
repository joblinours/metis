"use client";

import { Button } from "@metis/ui/components/button";
import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { Switch } from "@metis/ui/components/switch";
import { Textarea } from "@metis/ui/components/textarea";
import { Plus, X } from "lucide-react";
import { useId } from "react";

import type { DecisionQuestion, DecisionQuestionType } from "@/workflow/schema";

import { FormSelect } from "./form-select";

export const QUESTION_TYPE_OPTIONS: { value: DecisionQuestionType; label: string }[] = [
  { value: "boolean", label: "Yes/No" },
  { value: "choice", label: "Pick one" },
  { value: "score", label: "Rate" },
];

export function nextId(prefix: string, ids: string[], start: number): string {
  const numbers = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter(Number.isFinite);
  return `${prefix}${numbers.length === 0 ? start : Math.max(...numbers) + 1}`;
}

export function newQuestion(
  type: DecisionQuestionType,
  id: string,
  instructions = "",
): DecisionQuestion {
  switch (type) {
    case "boolean":
      return { id, type, instructions };
    case "choice":
      return {
        id,
        type,
        instructions,
        options: [
          { id: "o1", name: "" },
          { id: "o2", name: "" },
        ],
        other: true,
      };
    case "score":
      return {
        id,
        type,
        instructions,
        levels: [
          { id: "l0", name: "" },
          { id: "l1", name: "" },
        ],
      };
  }
}

type Item = { id: string; name: string; description?: string };

function ItemRows({
  items,
  placeholder,
  addLabel,
  onChange,
  onAdd,
}: {
  items: Item[];
  placeholder: string;
  addLabel: string;
  onChange: (next: Item[]) => void;
  onAdd: () => void;
}) {
  const update = (index: number, next: Partial<Item>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...next } : it)));
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
          <div className="flex items-center gap-1.5">
            <Input
              aria-label={placeholder}
              value={item.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder={placeholder}
            />
            {items.length > 2 && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${placeholder.toLowerCase()}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            )}
          </div>
          <Input
            aria-label="When it applies"
            value={item.description ?? ""}
            onChange={(e) => update(index, { description: e.target.value || undefined })}
            placeholder="When it applies (optional)"
          />
        </div>
      ))}
      <Button variant="outline" size="sm" className="border-dashed" onClick={onAdd}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

export function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: DecisionQuestion;
  index: number;
  onChange: (next: DecisionQuestion) => void;
  onRemove: () => void;
}) {
  const otherId = useId();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-medium text-[13px]">Q{index + 1}</span>
        <FormSelect
          label={`Q${index + 1} type`}
          className="flex-1"
          value={question.type}
          onValueChange={(type) => onChange(newQuestion(type, question.id, question.instructions))}
          options={QUESTION_TYPE_OPTIONS}
        />
        <Button variant="ghost" size="icon-sm" aria-label="Remove question" onClick={onRemove}>
          <X />
        </Button>
      </div>
      <Textarea
        aria-label={`Q${index + 1}`}
        value={question.instructions}
        onChange={(e) => onChange({ ...question, instructions: e.target.value })}
        placeholder="Is this email a request for a refund?"
        className="min-h-16"
      />
      {question.type === "choice" && (
        <>
          <ItemRows
            items={question.options}
            placeholder="Answer"
            addLabel="Answer"
            onChange={(options) => onChange({ ...question, options })}
            onAdd={() =>
              onChange({
                ...question,
                options: [
                  ...question.options,
                  {
                    id: nextId(
                      "o",
                      question.options.map((o) => o.id),
                      1,
                    ),
                    name: "",
                  },
                ],
              })
            }
          />
          <Field orientation="horizontal" className="justify-between">
            <FieldLabel htmlFor={otherId} className="font-normal text-muted-foreground">
              Offer “None of these fits”
            </FieldLabel>
            <Switch
              id={otherId}
              checked={question.other}
              onCheckedChange={(other) => onChange({ ...question, other })}
            />
          </Field>
        </>
      )}
      {question.type === "score" && (
        <>
          <span className="text-[12px] text-muted-foreground">Levels, lowest first</span>
          <ItemRows
            items={question.levels}
            placeholder="Level"
            addLabel="Level"
            onChange={(levels) => onChange({ ...question, levels })}
            onAdd={() =>
              onChange({
                ...question,
                levels: [
                  ...question.levels,
                  {
                    id: nextId(
                      "l",
                      question.levels.map((l) => l.id),
                      0,
                    ),
                    name: "",
                  },
                ],
              })
            }
          />
        </>
      )}
    </div>
  );
}
