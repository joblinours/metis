"use client";

import { createContext, useContext, useMemo } from "react";

import type { GraphOverlay } from "@/components/workflow-graph/overlay";
import type { GraphMailbox } from "@/workflow/graph";
import type { CardContext } from "@/workflow/kinds";
import type { WorkflowGraph, WorkflowSourceState } from "@/workflow/schema";
import { validateGraph } from "@/workflow/validation";

import { useLabelOptions } from "./label-options";

export interface EditorEnv {
  workflowId: string | null;
  mailboxes: GraphMailbox[];
  allowDecisionNodes: boolean;
  sources: ReadonlyMap<string, WorkflowSourceState>;
}

export interface Diagnostics {
  byNode: ReadonlyMap<string, string[]>;
  general: string[];
  count: number;
}

export type OverlaySource = { kind: "run"; runId: string } | { kind: "test" };

export interface OverlayState {
  overlay: GraphOverlay | null;
  source: OverlaySource | null;
  live: boolean;
  show: (source: OverlaySource, overlay: GraphOverlay, live: boolean) => void;
  clear: () => void;
}

export const EditorEnvContext = createContext<EditorEnv | null>(null);
export const DiagnosticsContext = createContext<Diagnostics>({
  byNode: new Map(),
  general: [],
  count: 0,
});
export const OverlayContext = createContext<OverlayState | null>(null);

export function useEditorEnv(): EditorEnv {
  const env = useContext(EditorEnvContext);
  if (!env) throw new Error("useEditorEnv must be used inside the workflow editor");
  return env;
}

export function useDiagnostics(): Diagnostics {
  return useContext(DiagnosticsContext);
}

export function useOverlay(): OverlayState {
  const overlay = useContext(OverlayContext);
  if (!overlay) throw new Error("useOverlay must be used inside the workflow editor");
  return overlay;
}

export function diagnose(graph: WorkflowGraph, env: EditorEnv): Diagnostics {
  const result = validateGraph(graph, {
    kind: "user",
    allowedMailboxIds: env.mailboxes.map((m) => m.mailboxId),
    aiMailboxIds: env.mailboxes.filter((m) => m.aiEnabled).map((m) => m.mailboxId),
    allowDecisionNodes: env.allowDecisionNodes,
  });
  if (result.ok) return { byNode: new Map(), general: [], count: 0 };
  const byNode = new Map<string, string[]>();
  const general: string[] = [];
  for (const error of result.errors) {
    if (error.nodeId && graph.nodes.some((n) => n.id === error.nodeId)) {
      const list = byNode.get(error.nodeId) ?? [];
      if (!list.includes(error.message)) list.push(error.message);
      byNode.set(error.nodeId, list);
    } else if (!general.includes(error.message)) {
      general.push(error.message);
    }
  }
  const count = general.length + [...byNode.values()].reduce((sum, list) => sum + list.length, 0);
  return { byNode, general, count };
}

export function useCardContext(graph: WorkflowGraph): CardContext {
  const { mailboxes } = useEditorEnv();
  const labels = useLabelOptions();
  return useMemo(
    () => ({
      graph,
      mailboxEmail: (id: string) => mailboxes.find((m) => m.mailboxId === id)?.email ?? null,
      labelName: (key: string) => labels.find((l) => l.value === key)?.label ?? key,
    }),
    [graph, mailboxes, labels],
  );
}
