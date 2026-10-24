"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AgentReference,
  type ReferenceType,
  type ResolvedReference,
  referenceKey,
} from "@/ai/references";
import { orpc } from "@/lib/orpc";

const BATCH_DELAY_MS = 40;
const BATCH_SIZE = 50;

export interface ReferenceScopeValue {
  workspaceSlug: string;
  types: readonly ReferenceType[];
}

interface ReferenceContextValue extends ReferenceScopeValue {
  lookup: (ref: AgentReference) => ResolvedReference | null | undefined;
  request: (ref: AgentReference) => void;
  remember: (ref: ResolvedReference) => void;
  open: ((ref: ResolvedReference) => void) | null;
}

const ReferenceContext = createContext<ReferenceContextValue | null>(null);

export function useAgentReferences(): ReferenceContextValue | null {
  return useContext(ReferenceContext);
}

export function AgentReferenceProvider({
  workspaceSlug,
  types,
  onOpen,
  children,
}: ReferenceScopeValue & {
  onOpen?: (ref: ResolvedReference) => void;
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<Record<string, ResolvedReference | null>>({});
  const known = useRef(entries);
  useEffect(() => {
    known.current = entries;
  });

  const queue = useRef(new Map<string, AgentReference>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(
    async function flushBatch() {
      timer.current = null;
      const batch = [...queue.current.values()].slice(0, BATCH_SIZE);
      if (batch.length === 0) return;
      for (const ref of batch) queue.current.delete(referenceKey(ref));

      try {
        const { references } = await orpc.agentReferences.resolve({
          workspaceSlug,
          refs: batch,
        });
        const found = new Map(references.map((r) => [referenceKey(r), r]));
        setEntries((prev) => {
          const next = { ...prev };
          for (const ref of batch) {
            const key = referenceKey(ref);
            next[key] = found.get(key) ?? null;
          }
          return next;
        });
      } catch (err) {
        console.error("[agent-references] resolve failed:", err);
        setEntries((prev) => {
          const next = { ...prev };
          for (const ref of batch) next[referenceKey(ref)] ??= null;
          return next;
        });
      }

      if (queue.current.size > 0) {
        timer.current = setTimeout(flushBatch, BATCH_DELAY_MS);
      }
    },
    [workspaceSlug],
  );

  const request = useCallback(
    (ref: AgentReference) => {
      const key = referenceKey(ref);
      if (key in known.current || queue.current.has(key)) return;
      queue.current.set(key, { type: ref.type, id: ref.id });
      if (timer.current === null) {
        timer.current = setTimeout(flush, BATCH_DELAY_MS);
      }
    },
    [flush],
  );

  const remember = useCallback((ref: ResolvedReference) => {
    setEntries((prev) => (prev[referenceKey(ref)] ? prev : { ...prev, [referenceKey(ref)]: ref }));
  }, []);

  const lookup = useCallback((ref: AgentReference) => entries[referenceKey(ref)], [entries]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const open = onOpen ?? null;
  const value = useMemo(
    () => ({ workspaceSlug, types, lookup, request, remember, open }),
    [workspaceSlug, types, lookup, request, remember, open],
  );

  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>;
}

export function useResolvedReference(ref: AgentReference): ResolvedReference | null | undefined {
  const ctx = useAgentReferences();
  const request = ctx?.request;
  const { type, id } = ref;

  useEffect(() => {
    request?.({ type, id });
  }, [request, type, id]);

  return ctx?.lookup(ref);
}
