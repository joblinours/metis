"use client";

import { Alert, AlertDescription, AlertTitle } from "@metis/ui/components/alert";
import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@metis/ui/components/field";
import { Input } from "@metis/ui/components/input";
import { ScrollArea } from "@metis/ui/components/scroll-area";
import { Separator } from "@metis/ui/components/separator";
import { Switch } from "@metis/ui/components/switch";
import { cn } from "@metis/ui/lib/utils";
import { CircleAlert, Copy, MousePointerClick, Trash2 } from "lucide-react";
import type { FocusEvent } from "react";

import { CATEGORY_BADGE, NodeIcon } from "@/components/workflow-graph/node-meta";
import { StatusIcon, statusLabel } from "@/components/workflow-history/run-status";
import { isTypingTarget } from "@/hooks/use-chord";
import { CATEGORY_LABELS, kindOf, nodeOutputs, nodeTitle } from "@/workflow/kinds";
import { MAX_STEP_TITLE, type WorkflowNode } from "@/workflow/schema";

import { useDiagnostics, useOverlay } from "./editor-context";
import { useEditor, useEditorStore } from "./editor-store";
import { StepForm } from "./forms";

const PASTE_OFFSET = { x: 32, y: 32 };

function useTypingAsOneStep() {
  const store = useEditorStore();
  return {
    onFocus: (event: FocusEvent) => {
      if (isTypingTarget(event.target) || event.target.getAttribute("role") === "slider") {
        store.getState().beginGesture();
      }
    },
    onBlur: (event: FocusEvent) => {
      if (isTypingTarget(event.target) || event.target.getAttribute("role") === "slider") {
        store.getState().endGesture();
      }
    },
  };
}

function Problems({ problems }: { problems: string[] }) {
  if (problems.length === 0) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>
        {problems.length === 1
          ? "Something needs attention"
          : `${problems.length} things need attention`}
      </AlertTitle>
      <AlertDescription>
        {problems.map((problem) => (
          <p key={problem}>{problem}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
}

function StepResults({ node }: { node: WorkflowNode }) {
  const { overlay, source } = useOverlay();
  const graph = useEditor((s) => s.graph);
  const result = overlay?.nodes.get(node.id);
  if (!result || !source) return null;
  const outputs = nodeOutputs(node, graph);
  const heading = source.kind === "test" ? "In the test run" : "In the selected run";
  return (
    <section className="flex flex-col gap-2" aria-label={heading}>
      <h3 className="flex items-center gap-1.5 font-medium text-[13px]">
        <StatusIcon status={result.status.status} className="size-3.5" />
        {heading}
        <span className="font-normal text-muted-foreground">
          · {result.status.status === null ? "not reached" : statusLabel(result.status.status)}
        </span>
      </h3>
      {result.status.detail && (
        <p className="text-[12px] text-muted-foreground">{result.status.detail}</p>
      )}
      {result.items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-soft rounded-lg border border-border-soft">
          {result.items.map((item) => {
            const routed = item.outputs
              .map((handle) => outputs.find((o) => o.id === handle)?.label)
              .filter(Boolean);
            return (
              <li key={item.id} className="flex items-start gap-2 px-2.5 py-2">
                <StatusIcon status={item.status} className="mt-0.5 size-3.5" />
                <div className="min-w-0 flex-1 text-[12px]">
                  {item.subject && <p className="truncate text-foreground">{item.subject}</p>}
                  {item.from && <p className="truncate text-faint">{item.from}</p>}
                  {routed.length > 0 && (
                    <p className="text-muted-foreground">→ {routed.join(", ")}</p>
                  )}
                  {item.detail && !routed.length && (
                    <p className="text-muted-foreground">{item.detail}</p>
                  )}
                  {item.error && (
                    <p className="break-words font-mono text-[11px] text-destructive-text">
                      {item.error}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StepInspector({ node }: { node: WorkflowNode }) {
  const store = useEditorStore();
  const problems = useDiagnostics().byNode.get(node.id) ?? [];
  const def = kindOf(node.kind);
  const patch = (next: Partial<WorkflowNode>) => store.getState().patchNode(node.id, next);
  const titleId = `step-title-${node.id}`;
  const skipId = `step-skip-${node.id}`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-md",
            CATEGORY_BADGE[def.category],
          )}
        >
          <NodeIcon kind={node.kind} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate font-medium text-[15px]">{nodeTitle(node)}</h2>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{CATEGORY_LABELS[def.category]}</Badge>
            {node.title && <Badge variant="outline">{def.label}</Badge>}
          </div>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{def.description}</p>

      <Problems problems={problems} />

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={titleId}>Name</FieldLabel>
          <Input
            id={titleId}
            value={node.title ?? ""}
            maxLength={MAX_STEP_TITLE}
            placeholder={def.label}
            onChange={(e) => patch({ title: e.target.value || undefined })}
          />
        </Field>
        {def.category === "action" && (
          <Field orientation="horizontal" className="justify-between">
            <div className="flex flex-col gap-0.5">
              <FieldLabel htmlFor={skipId}>Skip this step</FieldLabel>
              <FieldDescription>Mail passes straight through without the action.</FieldDescription>
            </div>
            <Switch
              id={skipId}
              checked={!!node.skip}
              onCheckedChange={(skip) => patch({ skip: skip || undefined })}
            />
          </Field>
        )}
      </FieldGroup>

      <Separator />

      <FieldGroup className="gap-4">
        <StepForm
          node={node}
          patch={patch}
          replace={(next) => store.getState().replaceNode(next)}
        />
      </FieldGroup>

      <StepResults node={node} />

      <Separator />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => store.getState().paste([node], [], PASTE_OFFSET)}
        >
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.getState().removeNodes([node.id])}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

function SelectionInspector({ ids }: { ids: string[] }) {
  const store = useEditorStore();
  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="font-medium text-[15px]">{ids.length} steps selected</h2>
      <p className="text-[13px] text-muted-foreground">
        Drag any of them to move them together, or copy them with Ctrl/⌘ C.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const { graph } = store.getState();
            const chosen = new Set(ids);
            store.getState().paste(
              graph.nodes.filter((n) => chosen.has(n.id)),
              graph.edges.filter((e) => chosen.has(e.source) && chosen.has(e.target)),
              PASTE_OFFSET,
            );
          }}
        >
          <Copy /> Duplicate
        </Button>
        <Button size="sm" variant="ghost" onClick={() => store.getState().removeNodes(ids)}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

function WorkflowInspector() {
  const graph = useEditor((s) => s.graph);
  const select = useEditor((s) => s.select);
  const diagnostics = useDiagnostics();
  const flagged = graph.nodes.filter((n) => diagnostics.byNode.has(n.id));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <MousePointerClick className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          Select a step to edit it. Drag from a step's output on the right to another step's input
          on the left to connect them.
        </p>
      </div>
      <p className="text-[12px] text-faint">
        {graph.nodes.length} step{graph.nodes.length === 1 ? "" : "s"} · {graph.edges.length}{" "}
        connection{graph.edges.length === 1 ? "" : "s"}
      </p>
      {diagnostics.count === 0 ? (
        <p className="text-[13px] text-status-success">Ready to save: no problems found.</p>
      ) : (
        <section className="flex flex-col gap-2" aria-label="Problems">
          <h3 className="font-medium text-[13px]">
            {diagnostics.count === 1 ? "1 problem" : `${diagnostics.count} problems`}
          </h3>
          {diagnostics.general.map((problem) => (
            <p key={problem} className="text-[13px] text-destructive-text">
              {problem}
            </p>
          ))}
          <ul className="flex flex-col gap-1">
            {flagged.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => select([node.id])}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
                >
                  <NodeIcon kind={node.kind} className="mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 text-[13px]">
                    <span className="font-medium">{nodeTitle(node)}</span>
                    <span className="block text-[12px] text-destructive-text">
                      {diagnostics.byNode.get(node.id)?.[0]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Inspector() {
  const selected = useEditor((s) => s.selected);
  const graph = useEditor((s) => s.graph);
  const typing = useTypingAsOneStep();
  const general = useDiagnostics().general;
  const present = graph.nodes.filter((n) => selected.includes(n.id));
  const node = present.length === 1 ? present[0] : undefined;

  return (
    <ScrollArea className="h-full bg-panel" {...typing}>
      <div aria-label="Inspector" role="region">
        {present.length > 0 && general.length > 0 && (
          <div className="px-4 pt-4">
            <Problems problems={general} />
          </div>
        )}
        {node ? (
          <StepInspector key={node.id} node={node} />
        ) : present.length > 1 ? (
          <SelectionInspector ids={present.map((n) => n.id)} />
        ) : (
          <WorkflowInspector />
        )}
      </div>
    </ScrollArea>
  );
}
