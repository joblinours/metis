"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@metis/ui/components/command";
import { cn } from "@metis/ui/lib/utils";

import { CATEGORY_BADGE, NodeIcon } from "@/components/workflow-graph/node-meta";
import { allSteps, CATEGORY_LABELS, STEP_CATEGORIES, type StepDef } from "@/workflow/steps";

import { useEditorEnv } from "./editor-context";
import { STEP_DRAG_TYPE, useAddStep } from "./workflow-canvas";

const DECISION_STEPS = new Set(["ai.ask", "ai.branch"]);

function usePaletteGroups() {
  const { allowDecisionSteps } = useEditorEnv();
  const steps = allSteps().filter(
    (def) =>
      (def.scope === undefined || def.scope === "any") &&
      (allowDecisionSteps || !DECISION_STEPS.has(def.key)),
  );
  return STEP_CATEGORIES.map((category) => ({
    category,
    steps: steps.filter((def) => def.category === category),
  })).filter((group) => group.steps.length > 0);
}

function StepItem({
  def,
  onPick,
  draggable,
}: {
  def: StepDef;
  onPick: (step: string) => void;
  draggable: boolean;
}) {
  return (
    <CommandItem
      value={`${def.label} ${CATEGORY_LABELS[def.category]} ${def.description}`}
      onSelect={() => onPick(def.key)}
      draggable={draggable}
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.setData(STEP_DRAG_TYPE, def.key);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className={cn("items-start gap-2.5 py-2", draggable && "cursor-grab active:cursor-grabbing")}
    >
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
          CATEGORY_BADGE[def.category],
        )}
      >
        <NodeIcon step={def.key} className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] text-foreground">{def.label}</span>
        <span className="line-clamp-2 text-[11px] text-muted-foreground leading-snug">
          {def.description}
        </span>
      </span>
    </CommandItem>
  );
}

function StepList({ onPick, draggable }: { onPick: (step: string) => void; draggable: boolean }) {
  const groups = usePaletteGroups();
  return (
    <CommandList className="max-h-none">
      <CommandEmpty>No step matches.</CommandEmpty>
      {groups.map((group) => (
        <CommandGroup key={group.category} heading={CATEGORY_LABELS[group.category]}>
          {group.steps.map((def) => (
            <StepItem key={def.key} def={def} onPick={onPick} draggable={draggable} />
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  );
}

export function StepPalette() {
  const addStep = useAddStep();
  return (
    <Command
      aria-label="Steps"
      className="h-full rounded-none! bg-panel"
      filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
    >
      <CommandInput placeholder="Search steps" />
      <p className="px-3 pt-2 pb-1 text-[11px] text-faint">
        Drag a step onto the canvas, or click it
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StepList onPick={(step) => addStep(step)} draggable />
      </div>
    </Command>
  );
}

export function QuickAdd({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addStep = useAddStep();
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add step"
      description="Search every step you can add to this workflow"
    >
      <Command
        filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
      >
        <CommandInput placeholder="Add a step…" />
        <div className="max-h-[60vh] overflow-y-auto">
          <StepList
            draggable={false}
            onPick={(step) => {
              addStep(step);
              onOpenChange(false);
            }}
          />
        </div>
      </Command>
    </CommandDialog>
  );
}
