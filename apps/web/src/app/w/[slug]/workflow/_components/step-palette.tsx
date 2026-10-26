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
import { CATEGORY_LABELS, kindOf, NODE_CATEGORIES } from "@/workflow/kinds";
import { isDecisionKind, WORKFLOW_NODE_KINDS, type WorkflowNodeKind } from "@/workflow/schema";

import { useEditorEnv } from "./editor-context";
import { STEP_DRAG_TYPE, useAddStep } from "./workflow-canvas";

function usePaletteGroups() {
  const { allowDecisionNodes } = useEditorEnv();
  const kinds = WORKFLOW_NODE_KINDS.filter(
    (kind) => kindOf(kind).scope === "any" && (allowDecisionNodes || !isDecisionKind(kind)),
  );
  return NODE_CATEGORIES.map((category) => ({
    category,
    kinds: kinds.filter((kind) => kindOf(kind).category === category),
  })).filter((group) => group.kinds.length > 0);
}

function StepItem({
  kind,
  onPick,
  draggable,
}: {
  kind: WorkflowNodeKind;
  onPick: (kind: WorkflowNodeKind) => void;
  draggable: boolean;
}) {
  const def = kindOf(kind);
  return (
    <CommandItem
      value={`${def.label} ${CATEGORY_LABELS[def.category]} ${def.description}`}
      onSelect={() => onPick(kind)}
      draggable={draggable}
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.setData(STEP_DRAG_TYPE, kind);
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
        <NodeIcon kind={kind} className="size-3.5" />
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

function StepList({
  onPick,
  draggable,
}: {
  onPick: (kind: WorkflowNodeKind) => void;
  draggable: boolean;
}) {
  const groups = usePaletteGroups();
  return (
    <CommandList className="max-h-none">
      <CommandEmpty>No step matches.</CommandEmpty>
      {groups.map((group) => (
        <CommandGroup key={group.category} heading={CATEGORY_LABELS[group.category]}>
          {group.kinds.map((kind) => (
            <StepItem key={kind} kind={kind} onPick={onPick} draggable={draggable} />
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
        <StepList onPick={(kind) => addStep(kind)} draggable />
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
            onPick={(kind) => {
              addStep(kind);
              onOpenChange(false);
            }}
          />
        </div>
      </Command>
    </CommandDialog>
  );
}
