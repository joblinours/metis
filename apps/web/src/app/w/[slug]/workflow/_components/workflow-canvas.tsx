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

import "@xyflow/react/dist/style.css";
import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { Loader2, Play, Plus, Save, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useMemo, useState } from "react";

import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { WorkflowOutput } from "@/server/schema";
import type { GraphMailbox, GraphTemplate, WfNode } from "@/workflow/graph";
import { flowHandle, fromFlow, templateGraph, toFlow } from "@/workflow/graph";
import { edgeLabel, kindLabel, outputLabel } from "@/workflow/kinds";
import type { WorkflowNodeKind } from "@/workflow/schema";
import {
  ACTION_KINDS,
  AUTHORABLE_TRIGGER_KINDS,
  DECISION_KINDS,
  edgeId,
  isDecisionKind,
  isMergeKind,
  MERGE_INPUT_PORT,
  MERGE_KINDS,
  mergeInputIndex,
} from "@/workflow/schema";
import { outputPortOf, validateGraph } from "@/workflow/validation";

import { LabelOptionsProvider } from "./label-options";
import { nodeTypes } from "./nodes";
import { useWorkflowActions } from "./workflow-actions";

interface WorkflowCanvasProps {
  mailboxes: GraphMailbox[];
  allowDecisionNodes: boolean;
  workflow: WorkflowOutput | null;
  template: GraphTemplate;
  onSaved: (workflow: WorkflowOutput) => void;
  onDeleted: (id: string) => void;
  initialStatus?: string | null;
}

const PALETTE: { label: string; kinds: readonly WorkflowNodeKind[] }[] = [
  { label: "Trigger", kinds: AUTHORABLE_TRIGGER_KINDS },
  { label: "Data", kinds: ["mailbox.source", "condition", ...MERGE_KINDS] },
  { label: "Decisions", kinds: DECISION_KINDS },
  { label: "Action", kinds: ACTION_KINDS },
];

function CanvasInner({
  mailboxes,
  allowDecisionNodes,
  workflow,
  template,
  onSaved,
  onDeleted,
  initialStatus,
}: WorkflowCanvasProps) {
  const palette = PALETTE.map((group) => ({
    ...group,
    kinds: group.kinds.filter((kind) => allowDecisionNodes || !isDecisionKind(kind)),
  })).filter((group) => group.kinds.length > 0);
  const scope = useWorkspaceScope();
  const { resolvedTheme } = useTheme();
  const { addNode } = useWorkflowActions();
  const [initial] = useState(() =>
    toFlow(workflow?.graph ?? templateGraph(template, mailboxes), mailboxes, workflow?.sources),
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<WfNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [name, setName] = useState(workflow?.name ?? "");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.source || !connection.target) return false;
      if (connection.source === connection.target) return false;
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      const fromAsk = source?.data.node.kind === "decision.ask";
      const toBranch = target?.data.node.kind === "decision.branch";
      if (fromAsk !== toBranch) return false;
      if (target && isMergeKind(target.data.node.kind)) {
        if (mergeInputIndex(connection.targetHandle) < 0) return false;
        const port = outputPortOf(fromFlow(nodes, edges), connection.source);
        if (port && port !== MERGE_INPUT_PORT) return false;
        return !edges.some(
          (e) =>
            e.target === connection.target &&
            (e.targetHandle === connection.targetHandle ||
              (e.source === connection.source &&
                (e.sourceHandle ?? "out") === (connection.sourceHandle ?? "out"))),
        );
      }
      return !edges.some((e) => e.target === connection.target);
    },
    [edges, nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const handle = flowHandle(connection.sourceHandle);
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            sourceHandle: handle,
            id: edgeId(connection.source, handle, connection.target, connection.targetHandle),
            type: "smoothstep",
            animated: true,
          },
          current,
        ),
      );
    },
    [setEdges],
  );

  const labeledEdges = useMemo(() => {
    const graph = fromFlow(nodes, edges);
    return edges.map((edge) => {
      const ref = {
        source: edge.source,
        sourceHandle: flowHandle(edge.sourceHandle),
        target: edge.target,
      };
      return {
        ...edge,
        label: outputLabel(graph, ref),
        ariaLabel: edgeLabel(graph, ref),
      };
    });
  }, [nodes, edges]);

  async function save() {
    setError(null);
    setStatus(null);
    if (!name.trim()) {
      setError("Give your workflow a name");
      return;
    }

    const graph = fromFlow(nodes, edges);
    const check = validateGraph(graph, {
      kind: "user",
      allowedMailboxIds: mailboxes.map((m) => m.mailboxId),
      aiMailboxIds: mailboxes.filter((m) => m.aiEnabled).map((m) => m.mailboxId),
      allowDecisionNodes,
    });
    if (!check.ok) {
      setError(check.errors[0]?.message ?? "This workflow is incomplete.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        ...scope,
        workflow: { name: name.trim(), enabled, graph },
      };
      const result = workflow
        ? await orpc.workflows.update({ id: workflow.id, ...body })
        : await orpc.workflows.create(body);
      if (result.workflow) {
        const sources = new Map(result.workflow.sources.map((s) => [s.triggerNodeId, s]));
        setNodes((current) =>
          current.map((n) => ({
            ...n,
            data: { ...n.data, source: sources.get(n.id) },
          })),
        );
        onSaved(result.workflow);
        setStatus("Saved");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save workflow");
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    if (!workflow) return;
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const result = await orpc.workflows.run({ ...scope, id: workflow.id });
      setStatus(`Queued run ${result.runId.slice(0, 8)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue a run");
    } finally {
      setRunning(false);
    }
  }

  async function doDelete() {
    if (!workflow) return;
    setConfirmDelete(false);
    try {
      await orpc.workflows.delete({ ...scope, id: workflow.id });
      onDeleted(workflow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={labeledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-background" />
        <Controls className="!border-border !bg-surface" showInteractive={false} />
        <MiniMap pannable className="!border-border !bg-surface" maskColor="rgba(0,0,0,0.4)" />

        <Panel position="top-left" className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled workflow"
            className="w-56 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={() => setEnabled((on) => !on)}
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                "flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                enabled ? "bg-primary" : "bg-active",
              )}
            >
              <span
                className={cn(
                  "block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
                  enabled ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </span>
            {enabled ? "Enabled" : "Disabled"}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-surface text-[12px] text-muted-foreground dark:bg-surface"
                />
              }
            >
              <Plus className="size-3.5" /> Add step
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-100 w-56">
              {palette.map((group) => (
                <DropdownMenuGroup key={group.label}>
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.kinds.map((kind) => (
                    <DropdownMenuItem key={kind} onClick={() => addNode(kind, mailboxes)}>
                      {kindLabel(kind)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Panel>

        <Panel position="top-right" className="flex items-center gap-2">
          {status && (
            <span className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground">
              {status}
            </span>
          )}
          {error && (
            <span className="max-w-72 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive-text">
              {error}
            </span>
          )}
          {workflow && (
            <Button
              variant="outline"
              size="sm"
              aria-label="Delete workflow"
              title="Delete workflow"
              onClick={() => setConfirmDelete(true)}
              className="bg-surface text-[12px] text-muted-foreground dark:bg-surface"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          {workflow && (
            <Button
              variant="outline"
              size="sm"
              onClick={runNow}
              disabled={running}
              className="bg-surface text-[12px] text-muted-foreground dark:bg-surface"
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Run now
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            onClick={save}
            disabled={saving}
            className="text-[12px]"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {workflow ? "Save" : "Create workflow"}
          </Button>
        </Panel>
      </ReactFlow>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              {workflow
                ? `"${workflow.name}" will stop running. Runs already in flight finish, and its history stays.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <LabelOptionsProvider mailboxes={props.mailboxes}>
        <CanvasInner {...props} />
      </LabelOptionsProvider>
    </ReactFlowProvider>
  );
}
