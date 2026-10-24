"use client";

import { Button } from "@metis/ui/components/button";
import { Field, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { Switch } from "@metis/ui/components/switch";
import { Textarea } from "@metis/ui/components/textarea";
import { Plus, X } from "lucide-react";

import type { DecisionQuestion, DecisionQuestionType } from "@/workflow/schema";

import { NodeSelect } from "../node-select";

export const QUESTION_TYPE_OPTIONS: {
  value: DecisionQuestionType;
  label: string;
}[] = [
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
    <div className="flex flex-col gap-1.5">
      {items.map((item, index) => (
        <div key={item.id} className="flex flex-col gap-1 rounded-md border p-1.5">
          <div className="flex items-center gap-1">
            <Input
              value={item.name}
              onChange={(e) => update(index, { name: e.target.value })}
              placeholder={placeholder}
              className="nodrag h-7 text-xs"
            />
            {items.length > 2 && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="nodrag"
                aria-label="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(items.filter((_, i) => i !== index));
                }}
              >
                <X />
              </Button>
            )}
          </div>
          <Input
            value={item.description ?? ""}
            onChange={(e) => update(index, { description: e.target.value || undefined })}
            placeholder="When it applies (optional)"
            className="nodrag h-7 text-xs"
          />
        </div>
      ))}
      <Button
        variant="outline"
        size="xs"
        className="nodrag border-dashed"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
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
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-1.5">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-xs">Q{index + 1}</span>
        <NodeSelect
          className="flex-1"
          value={question.type}
          onValueChange={(type) => onChange(newQuestion(type, question.id, question.instructions))}
          options={QUESTION_TYPE_OPTIONS}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          className="nodrag"
          aria-label="Remove question"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X />
        </Button>
      </div>
      <Textarea
        value={question.instructions}
        onChange={(e) => onChange({ ...question, instructions: e.target.value })}
        placeholder="Is this email a request for a refund?"
        className="nodrag min-h-14 text-xs"
      />
      {question.type === "choice" && (
        <>
          <ItemRows
            items={question.options}
            placeholder="Answer"
            addLabel="Answer"
            onChange={(options) =>
              onChange({
                ...question,
                options,
              })
            }
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
            <FieldLabel className="font-normal text-muted-foreground text-xs">
              Offer “None of these fits”
            </FieldLabel>
            <Switch
              className="nodrag"
              checked={question.other}
              onCheckedChange={(other) => onChange({ ...question, other })}
            />
          </Field>
        </>
      )}
      {question.type === "score" && (
        <>
          <span className="text-muted-foreground text-xs">Levels, lowest first</span>
          <ItemRows
            items={question.levels}
            placeholder="Level"
            addLabel="Level"
            onChange={(levels) =>
              onChange({
                ...question,
                levels,
              })
            }
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
