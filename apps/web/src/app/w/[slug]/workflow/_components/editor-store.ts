"use client";

import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { type GraphMailbox, newNode, newNodeId } from "@/workflow/graph";
import {
  edgeId,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeKind,
} from "@/workflow/schema";

export interface Snapshot {
  name: string;
  enabled: boolean;
  graph: WorkflowGraph;
}

type Point = { x: number; y: number };

const HISTORY_LIMIT = 100;

interface EditorState extends Snapshot {
  selected: string[];
  past: Snapshot[];
  future: Snapshot[];
  saved: Snapshot;
  gesture: { depth: number; start: Snapshot | null };
}

interface EditorActions {
  update: (fn: (current: Snapshot) => Snapshot) => void;
  setGraph: (fn: (graph: WorkflowGraph) => WorkflowGraph) => void;
  setName: (name: string) => void;
  setEnabled: (enabled: boolean) => void;
  addNode: (kind: WorkflowNodeKind, position: Point, mailboxes: GraphMailbox[]) => string;
  patchNode: (id: string, patch: Partial<WorkflowNode>) => void;
  replaceNode: (node: WorkflowNode) => void;
  removeNodes: (ids: string[]) => void;
  removeEdges: (ids: string[]) => void;
  connect: (edge: WorkflowEdge) => void;
  moveNodes: (positions: Record<string, Point>) => void;
  paste: (nodes: WorkflowNode[], edges: WorkflowEdge[], offset: Point) => string[];
  select: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  markSaved: (snapshot: Snapshot) => void;
}

export type EditorStore = StoreApi<EditorState & EditorActions>;

function snapshotOf(state: Snapshot): Snapshot {
  return { name: state.name, enabled: state.enabled, graph: state.graph };
}

export function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (a === b) return true;
  return (
    a.name === b.name &&
    a.enabled === b.enabled &&
    (a.graph === b.graph || JSON.stringify(a.graph) === JSON.stringify(b.graph))
  );
}

function withoutNodes(graph: WorkflowGraph, ids: ReadonlySet<string>): WorkflowGraph {
  return {
    nodes: graph.nodes.filter((n) => !ids.has(n.id)),
    edges: graph.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
  };
}

export function createEditorStore(initial: Snapshot): EditorStore {
  return createStore<EditorState & EditorActions>()((set, get) => {
    const commit = (next: Snapshot) => {
      const state = get();
      const current = snapshotOf(state);
      if (sameSnapshot(current, next)) return;
      const recording = state.gesture.depth === 0;
      set({
        ...next,
        past: recording ? [...state.past, current].slice(-HISTORY_LIMIT) : state.past,
        future: recording ? [] : state.future,
      });
    };

    const restore = (from: "past" | "future") => {
      const state = get();
      const stack = state[from];
      const target = stack.at(-1);
      if (!target) return;
      const current = snapshotOf(state);
      const remaining = stack.slice(0, -1);
      const ids = new Set(target.graph.nodes.map((n) => n.id));
      set({
        ...target,
        selected: state.selected.filter((id) => ids.has(id)),
        past: from === "past" ? remaining : [...state.past, current],
        future: from === "future" ? remaining : [...state.future, current],
      });
    };

    return {
      ...initial,
      selected: [],
      past: [],
      future: [],
      saved: initial,
      gesture: { depth: 0, start: null },

      update: (fn) => commit(fn(snapshotOf(get()))),
      setGraph: (fn) => get().update((s) => ({ ...s, graph: fn(s.graph) })),
      setName: (name) => get().update((s) => ({ ...s, name })),
      setEnabled: (enabled) => get().update((s) => ({ ...s, enabled })),

      addNode: (kind, position, mailboxes) => {
        const node = newNode(kind, position, mailboxes);
        get().setGraph((graph) => ({ ...graph, nodes: [...graph.nodes, node] }));
        set({ selected: [node.id] });
        return node.id;
      },

      patchNode: (id, patch) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) =>
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a patch carries fields of the node's own kind; the union cannot express that correlation
            n.id === id ? ({ ...n, ...patch } as WorkflowNode) : n,
          ),
        })),

      replaceNode: (node) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) => (n.id === node.id ? node : n)),
        })),

      removeNodes: (ids) => {
        const gone = new Set(ids);
        if (!get().graph.nodes.some((n) => gone.has(n.id))) return;
        get().setGraph((graph) => withoutNodes(graph, gone));
        set((s) => ({ selected: s.selected.filter((id) => !gone.has(id)) }));
      },

      removeEdges: (ids) => {
        const gone = new Set(ids);
        if (!get().graph.edges.some((e) => gone.has(e.id))) return;
        get().setGraph((graph) => ({
          ...graph,
          edges: graph.edges.filter((e) => !gone.has(e.id)),
        }));
      },

      connect: (edge) =>
        get().setGraph((graph) =>
          graph.edges.some((e) => e.id === edge.id)
            ? graph
            : { ...graph, edges: [...graph.edges, edge] },
        ),

      moveNodes: (positions) =>
        get().setGraph((graph) => ({
          ...graph,
          nodes: graph.nodes.map((n) => {
            const position = positions[n.id];
            return position ? { ...n, position } : n;
          }),
        })),

      paste: (nodes, edges, offset) => {
        const ids = new Map(nodes.map((n) => [n.id, newNodeId()]));
        const copies = nodes.map((n) => ({
          ...n,
          id: ids.get(n.id) ?? newNodeId(),
          position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        }));
        const links = edges.flatMap((e): WorkflowEdge[] => {
          const source = ids.get(e.source);
          const target = ids.get(e.target);
          if (!source || !target) return [];
          return [
            {
              ...e,
              source,
              target,
              id: edgeId(source, e.sourceHandle, target, e.targetHandle),
            },
          ];
        });
        get().setGraph((graph) => ({
          nodes: [...graph.nodes, ...copies],
          edges: [...graph.edges, ...links],
        }));
        const selected = copies.map((n) => n.id);
        set({ selected });
        return selected;
      },

      select: (ids) => {
        const current = get().selected;
        if (current.length === ids.length && current.every((id, i) => id === ids[i])) return;
        set({ selected: ids });
      },

      undo: () => restore("past"),
      redo: () => restore("future"),

      beginGesture: () => {
        const { gesture } = get();
        set({
          gesture: {
            depth: gesture.depth + 1,
            start: gesture.depth === 0 ? snapshotOf(get()) : gesture.start,
          },
        });
      },

      endGesture: () => {
        const state = get();
        const { depth, start } = state.gesture;
        if (depth === 0) return;
        if (depth > 1) {
          set({ gesture: { depth: depth - 1, start } });
          return;
        }
        const changed = start !== null && !sameSnapshot(start, snapshotOf(state));
        set({
          gesture: { depth: 0, start: null },
          ...(changed && start
            ? { past: [...state.past, start].slice(-HISTORY_LIMIT), future: [] }
            : {}),
        });
      },

      markSaved: (snapshot) => set({ saved: snapshot }),
    };
  });
}

export const EditorStoreContext = createContext<EditorStore | null>(null);

export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside the workflow editor");
  return store;
}

export function useEditor<T>(select: (state: EditorState & EditorActions) => T): T {
  return useStore(useEditorStore(), select);
}

export function useIsDirty(): boolean {
  return useEditor((s) => !sameSnapshot(snapshotOf(s), s.saved));
}

export { snapshotOf };
