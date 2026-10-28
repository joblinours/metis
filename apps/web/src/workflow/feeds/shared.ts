import "server-only";
import type { BackgroundPrincipal } from "../authorization";
import type { FeedCursor } from "../runtime";
import type { GraphNode } from "../schema";
import type { DefinitionRow, TriggerRow } from "../store";

export interface FeedEvent {
  key: string;
  at: Date;
  value: unknown;
}

export interface FeedPoll {
  events: FeedEvent[];
  baseline: boolean;
  cursor: FeedCursor;
  nextDueAt?: Date;
  error?: string;
}

export interface FeedContext {
  definition: DefinitionRow;
  principal: BackgroundPrincipal;
  trigger: TriggerRow;
  node: GraphNode;
  now: Date;
  signal?: AbortSignal;
  cursors: Map<string, FeedCursor>;
}

export function literalParam(node: GraphNode, name: string): string {
  const bound = node.params[name];
  return bound?.kind === "literal" && typeof bound.value === "string" ? bound.value : "";
}

export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("The tick ran out of budget"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

export function freshCursor(scope: string, now: Date): FeedCursor {
  return { scope, seen: [], scans: 0, baselined: false, updatedAt: now.toISOString() };
}
