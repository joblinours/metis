"use client";

import { cn } from "@metis/ui/lib/utils";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  Handle,
  type NodeProps,
  type NodeTypes,
  type OnSelectionChangeFunc,
  Position,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import { cva } from "class-variance-authority";
import { Move } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { iconFor, toneFor } from "@/components/workflow-node-meta";
import type { WorkflowRunDetail } from "@/server/schema";
import { kindLabel } from "@/workflow/kinds";
import { isMergeKind, mergeInputHandle } from "@/workflow/schema";

import { buildRunEdges, buildRunNodes, type RunGraphNode } from "./run-graph-elements";
import { StatusIcon, type StepState } from "./run-status";

const nodeVariants = cva(
  "w-56 rounded-xl border bg-surface shadow-sm transition-[opacity,box-shadow]",
  {
    variants: {
      tone: {
        completed: "border-status-success/60",
        failed: "border-destructive-text/70",
        unknown: "border-brand-text/70",
        blocked: "border-brand-text/50",
        active: "border-border",
        skipped: "border-border border-dashed opacity-75",
        idle: "border-border border-dashed opacity-50",
      },
      selected: {
        true: "ring-2 ring-primary ring-offset-2 ring-offset-background",
        false: "",
      },
    },
    defaultVariants: { tone: "active", selected: false },
  },
);

function toneOf(state: StepState) {
  switch (state.status) {
    case null:
      return "idle";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "unknown":
      return "unknown";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skipped";
    default:
      return "active";
  }
}

const handleClass = "!h-1.5 !w-1.5 !min-w-0 !min-h-0 !border-0 !bg-muted-foreground/60";

function RunGraphNodeView({ data, selected }: NodeProps<RunGraphNode>) {
  const { kind, mailbox, state, itemCount, inputPorts, outputs } = data;
  const isTrigger = kind.startsWith("trigger.");
  return (
    <div className={nodeVariants({ tone: toneOf(state), selected })}>
      {isMergeKind(kind)
        ? Array.from({ length: inputPorts }, (_, index) => (
            <Handle
              key={index}
              type="target"
              id={mergeInputHandle(index)}
              position={Position.Top}
              isConnectable={false}
              style={{ left: `${((index + 1) / (inputPorts + 1)) * 100}%` }}
              className={handleClass}
            />
          ))
        : !isTrigger && (
            <Handle
              type="target"
              position={Position.Top}
              isConnectable={false}
              className={handleClass}
            />
          )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-t-xl border-border-soft border-b px-3 py-2",
          toneFor(kind),
        )}
      >
        {iconFor(kind)}
        <span className="min-w-0 flex-1 truncate font-medium text-[12px] text-foreground">
          {kindLabel(kind)}
        </span>
      </div>
      <div className="flex flex-col gap-1 px-3 py-2">
        {mailbox && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">{mailbox}</p>
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-foreground">
          <StatusIcon status={state.status} className="size-3.5" />
          <span className="capitalize">{state.label}</span>
          {itemCount > 0 && (
            <span className="text-faint">
              · {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </div>
      {outputs.map((output, index) => (
        <Handle
          key={output.id}
          type="source"
          id={output.id}
          position={Position.Bottom}
          isConnectable={false}
          title={output.label}
          style={{ left: `${((index + 0.5) / outputs.length) * 100}%` }}
          className={handleClass}
        />
      ))}
    </div>
  );
}

const nodeTypes: NodeTypes = { run: RunGraphNodeView };

const LEGEND: { status: string | null; label: string }[] = [
  { status: "completed", label: "Completed" },
  { status: "skipped", label: "Skipped" },
  { status: "failed", label: "Failed" },
  { status: "blocked", label: "Blocked" },
  { status: "unknown", label: "Needs review" },
  { status: null, label: "Not reached" },
];

const COARSE_POINTER = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER).matches,
    () => false,
  );
}

export function WorkflowRunGraph({
  run,
  mailboxLabel,
  selectedId,
  onSelect,
}: {
  run: WorkflowRunDetail;
  mailboxLabel: (id: string | null) => string | null;
  selectedId: string | null;
  onSelect: (nodeId: string | null) => void;
}) {
  const built = useMemo(
    () => buildRunNodes(run, mailboxLabel, selectedId),
    [run, mailboxLabel, selectedId],
  );
  const edges = useMemo(() => buildRunEdges(run), [run]);
  const coarse = useCoarsePointer();
  const { resolvedTheme } = useTheme();
  const [moving, setMoving] = useState(false);
  const locked = coarse && !moving;
  const [nodes, setNodes, onNodesChange] = useNodesState<RunGraphNode>(built);

  useEffect(() => {
    setNodes((current) => {
      const measured = new Map(current.map((n) => [n.id, n.measured]));
      return built.map((n) => ({ ...n, measured: measured.get(n.id) }));
    });
  }, [built, setNodes]);

  const onSelectionChange = useCallback<OnSelectionChangeFunc<RunGraphNode>>(
    ({ nodes: picked }) => onSelect(picked[0]?.id ?? null),
    [onSelect],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[360px] overflow-hidden rounded-xl border border-border sm:h-[440px]">
        <ReactFlow
          onKeyDown={(event) => {
            if (
              event.key === " " &&
              event.target instanceof HTMLElement &&
              event.target.classList.contains("react-flow__node")
            ) {
              event.preventDefault();
            }
          }}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable={false}
          edgesReconnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zoomOnScroll={false}
          panOnDrag={!locked}
          zoomOnPinch={!locked}
          preventScrolling={false}
          minZoom={0.2}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          className={cn("bg-background", locked && "[&_.react-flow__pane]:!touch-auto")}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            className="!bg-background"
          />
          <Controls className="!border-border !bg-surface" showInteractive={false}>
            {coarse && (
              <ControlButton
                aria-label={moving ? "Stop moving the graph" : "Move the graph"}
                aria-pressed={moving}
                title={moving ? "Stop moving the graph" : "Move the graph"}
                onClick={() => setMoving((on) => !on)}
                className={cn(moving && "!bg-primary/15")}
              >
                <Move />
              </ControlButton>
            )}
          </Controls>
        </ReactFlow>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
        {LEGEND.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1">
            <StatusIcon status={entry.status} className="size-3" />
            {entry.label}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <StatusIcon status="pending" className="size-3" />
          In progress or sending
        </li>
        <li className="flex items-center gap-1">
          <span className="h-0.5 w-4 rounded bg-primary" />
          Path taken
        </li>
        <li className="flex items-center gap-1">
          <span className="w-4 border-border border-t-2 border-dashed" />
          Not taken
        </li>
      </ul>
    </div>
  );
}
