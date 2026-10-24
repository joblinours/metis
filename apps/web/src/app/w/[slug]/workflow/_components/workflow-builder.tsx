"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { cn } from "@metis/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, History, Loader2, Plus, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ResponsiveAside } from "@/components/mobile-aside";
import { useWorkspacePath, useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { WorkflowOutput } from "@/server/schema";
import type { GraphMailbox, GraphTemplate } from "@/workflow/graph";
import { GRAPH_TEMPLATES, TEMPLATE_LABELS } from "@/workflow/graph";
import { workflowPath, workspacePath, workspaceRootPath } from "@/workspace/path";

import { WorkflowCanvas } from "./workflow-canvas";

type Selection = { mode: "new"; template: GraphTemplate } | { mode: "workflow"; id: string } | null;

const NO_WORKFLOWS: WorkflowOutput[] = [];

interface WorkflowBuilderProps {
  mailboxes: GraphMailbox[];
  allowDecisionNodes: boolean;
  initialWorkflowId: string | null;
}

export function WorkflowBuilder({
  mailboxes,
  allowDecisionNodes,
  initialWorkflowId,
}: WorkflowBuilderProps) {
  const { workspaceSlug } = useWorkspacePath();
  const scope = useWorkspaceScope();
  const inboxHref = workspaceSlug ? workspacePath(workspaceSlug) : workspaceRootPath();
  const queryClient = useQueryClient();
  const listOptions = rpc.workflows.list.queryOptions({ input: scope });
  const query = useQuery(listOptions);
  const workflows: WorkflowOutput[] = query.data?.workflows ?? NO_WORKFLOWS;
  const loading = query.isPending && !query.isError;
  const loadError = query.error ? query.error.message || "Could not load your workflows" : null;
  const [chosen, setSelection] = useState<Selection>(() =>
    initialWorkflowId ? { mode: "workflow", id: initialWorkflowId } : null,
  );
  const firstWorkflow = query.data?.workflows?.[0];
  const selection: Selection =
    chosen ??
    (query.data
      ? firstWorkflow
        ? { mode: "workflow", id: firstWorkflow.id }
        : { mode: "new", template: "single" }
      : null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  function setWorkflows(update: (list: WorkflowOutput[]) => WorkflowOutput[]) {
    queryClient.setQueryData(listOptions.queryKey, (old) =>
      old ? { ...old, workflows: update(old.workflows ?? []) } : old,
    );
  }

  const selectedWorkflow =
    selection?.mode === "workflow" ? (workflows.find((w) => w.id === selection.id) ?? null) : null;

  function handleSaved(saved: WorkflowOutput) {
    if (!workflows.some((w) => w.id === saved.id)) setJustCreated(saved.id);
    setWorkflows((prev) => {
      const exists = prev.some((w) => w.id === saved.id);
      return exists ? prev.map((w) => (w.id === saved.id ? saved : w)) : [...prev, saved];
    });
    setSelection({ mode: "workflow", id: saved.id });
  }

  function handleDeleted(id: string) {
    const next = workflows.filter((w) => w.id !== id);
    setWorkflows(() => next);
    const first = next[0];
    setSelection(first ? { mode: "workflow", id: first.id } : { mode: "new", template: "single" });
  }

  const canvasKey =
    selection?.mode === "workflow" ? selection.id : `new:${selection?.template ?? "single"}`;

  return (
    <div className="flex h-full w-full">
      <ResponsiveAside label="Workflows" closeKey={canvasKey}>
        <aside className="flex h-full w-64 shrink-0 flex-col border-border border-r bg-panel">
          <div className="flex items-center gap-2 border-border-soft border-b px-3 py-2.5">
            <Link
              href={inboxHref}
              aria-label="Back to mail"
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <span className="flex-1 font-medium font-serif text-foreground text-sm">Workflows</span>
          </div>

          <div className="p-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] transition-colors hover:bg-hover",
                      selection?.mode === "new"
                        ? "bg-brand-soft text-primary"
                        : "text-muted-foreground",
                    )}
                  />
                }
              >
                <Plus className="size-3.5" /> New workflow
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {GRAPH_TEMPLATES.map((template) => (
                  <DropdownMenuItem
                    key={template}
                    onClick={() => setSelection({ mode: "new", template })}
                  >
                    {TEMPLATE_LABELS[template]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin opacity-50" />
              </div>
            ) : loadError ? (
              <p className="px-2 py-3 text-[12px] text-destructive-text">{loadError}</p>
            ) : workflows.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-faint">
                No workflows yet. Build one on the canvas to auto-triage your inbox.
              </p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {workflows.map((flow) => {
                  const active = selection?.mode === "workflow" && selection.id === flow.id;
                  return (
                    <li key={flow.id}>
                      <button
                        type="button"
                        onClick={() => setSelection({ mode: "workflow", id: flow.id })}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-hover",
                          active && "bg-active",
                        )}
                      >
                        <WorkflowIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            flow.enabled ? "text-primary" : "text-faint",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {flow.name}
                        </span>
                        {!flow.enabled && <span className="text-[10px] text-faint">off</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-border-soft border-t p-2">
            <Link
              href={workspaceSlug ? workflowPath(workspaceSlug, "history") : workspaceRootPath()}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[12px] text-muted-foreground transition-colors hover:bg-hover"
            >
              <History className="size-3.5" /> Activity
            </Link>
          </div>
        </aside>
      </ResponsiveAside>

      <div className="min-h-0 min-w-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin opacity-50" />
          </div>
        ) : (
          <WorkflowCanvas
            key={canvasKey}
            mailboxes={mailboxes}
            allowDecisionNodes={allowDecisionNodes}
            workflow={selectedWorkflow}
            template={selection?.mode === "new" ? selection.template : "single"}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            initialStatus={
              selection?.mode === "workflow" && selection.id === justCreated ? "Saved" : null
            }
          />
        )}
      </div>
    </div>
  );
}
