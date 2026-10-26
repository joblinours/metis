import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import type { DraftPayload } from "@/types/mail";

import type { Authorization, AuthorizedMailbox, BackgroundPrincipal } from "./authorization";
import {
  authorizeMailbox,
  authorizeMailboxAccess,
  authorizeMailboxAi,
  resolvePrincipal,
} from "./authorization";
import { errorCode } from "./diagnostics";
import { runNode } from "./handlers";
import {
  BlockedError,
  type ExecutionMode,
  type HandlerResult,
  isDispatchNode,
  type NodeContext,
  type OutHandle,
} from "./nodes";
import type { DraftFacts, Envelope, NodeReceipt, RunInput, RunSummaryLine } from "./runtime";
import {
  BARRIER_INPUT_KEY,
  isMergeKind,
  mergeInputIndex,
  type NodeStatus,
  type RunStatus,
  type WorkflowGraph,
  type WorkflowNode,
} from "./schema";
import {
  beginNodeRun,
  type DefinitionRow,
  findNodeRun,
  finishNodeRun,
  reclaimNodeRun,
  reconcileNodeRun,
  setDefinitionEnabled,
} from "./store";
import { firstError, validateGraph } from "./validation";

export interface ExecuteOptions {
  runId: string | null;
  leaseToken?: string;
  definition: DefinitionRow;
  graph: WorkflowGraph;
  principal: BackgroundPrincipal;
  input: RunInput;
  now: Date;
  mode?: ExecutionMode;
  seedDraft?: DraftFacts;
  signal?: AbortSignal;
  deadline?: number;
  reserveMs?: number;
  payload?: () => Promise<DraftPayload | null>;
  isCancelled?: () => Promise<boolean>;
  heartbeat?: () => Promise<boolean>;
  trace?: (step: TraceStep) => void;
}

export interface TraceStep {
  nodeId: string;
  envelope: Envelope;
  status: NodeStatus;
  outputs: { handle: OutHandle; count: number }[];
  detail?: string;
  error?: string;
}

export interface ExecutionOutcome {
  status: RunStatus;
  summary: RunSummaryLine[];
  error?: string;
  retryable: boolean;
  leaseLost: boolean;
  interrupted: boolean;
  blocked: boolean;
  drafts: DraftFacts[];
}

class LeaseLostError extends Error {}
class CancelledError extends Error {}
class AbortedError extends Error {}
class ReserveExhaustedError extends Error {
  constructor() {
    super("Not enough budget left to start this step safely");
  }
}

function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new AbortedError("The tick ran out of budget during a provider call"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new AbortedError("The tick ran out of budget during a provider call"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

interface StoredOutputs {
  outputs: { handle: OutHandle; envelopes: Envelope[] }[];
  detail?: string;
}

function redactEnvelope(envelope: Envelope): Envelope {
  if (envelope.port === "message") {
    return {
      ...envelope,
      message: {
        ...envelope.message,
        snippet: "",
        bodyText: undefined,
        loaded: false,
      },
    };
  }
  if (envelope.port === "draft") {
    return {
      ...envelope,
      draft: { ...envelope.draft, bodyHtml: undefined, bodyText: undefined },
    };
  }
  return envelope;
}

function receiptFor(receipt: NodeReceipt | undefined, envelope: Envelope): NodeReceipt | null {
  if (envelope.port !== "message") return receipt ?? null;
  const { subject, from, fromName } = envelope.message;
  return {
    ...receipt,
    message: { subject: subject || "(no subject)", from: fromName || from },
  };
}

function redact(outputs: StoredOutputs["outputs"]): StoredOutputs["outputs"] {
  return outputs.map((out) => ({
    handle: out.handle,
    envelopes: out.envelopes.map(redactEnvelope),
  }));
}

function reconcileLater(
  pending: Promise<HandlerResult>,
  nodeRunId: string,
  node: WorkflowNode,
  definition: DefinitionRow,
): void {
  pending
    .then(async (late) => {
      const settled = await reconcileNodeRun({
        id: nodeRunId,
        status: "completed",
        receipt: late.receipt ?? null,
      });
      if (!settled) {
        console.warn(
          `[workflow] late result for node run ${nodeRunId} ignored: it was already resolved or changed`,
        );
      }
      if (settled && definition.kind === "snooze" && node.kind === "action.archive") {
        await setDefinitionEnabled(definition.id, true);
      }
    })
    .catch(async (err: unknown) => {
      const settled = await reconcileNodeRun({
        id: nodeRunId,
        status: "failed",
        error: sanitizeError(err),
      });
      if (!settled) {
        console.warn(
          `[workflow] late failure for node run ${nodeRunId} ignored: it was already resolved or changed`,
        );
      }
    })
    .catch((err: unknown) => {
      console.error(
        `[workflow] late reconciliation failed for node run ${nodeRunId} code=${errorCode(err)}`,
      );
    });
}

function outKey(nodeId: string, handle: OutHandle): string {
  return `${nodeId}:${handle}`;
}

interface Inbound {
  source: string;
  handle: OutHandle;
  port: number;
}

function orderMergeInputs(sources: Inbound[]): Inbound[] {
  return sources.toSorted((a, b) => a.port - b.port);
}

type BranchState = "settled" | "pending" | "blocked" | "failed";

const BRANCH_RANK: Record<BranchState, number> = {
  settled: 0,
  pending: 1,
  blocked: 2,
  failed: 3,
};

function worse(a: BranchState, b: BranchState): BranchState {
  return BRANCH_RANK[a] >= BRANCH_RANK[b] ? a : b;
}

interface BarrierInput {
  port: number;
  state: BranchState;
  count: number;
}

const BARRIER_STATUS: Record<BranchState, NodeStatus> = {
  settled: "completed",
  pending: "pending",
  blocked: "blocked",
  failed: "failed",
};

function describeHold(inputs: BarrierInput[], state: BranchState): string {
  const ports = inputs
    .filter((input) => input.state === state)
    .map((input) => input.port + 1)
    .join(", ");
  if (state === "pending") return `waiting for input ${ports} to finish`;
  if (state === "blocked") return `held: input ${ports} is blocked`;
  return `held: input ${ports} did not succeed`;
}

function resolveStatus(counts: Record<NodeStatus, number>, interrupted: boolean): RunStatus {
  if (counts.failed > 0 || counts.unknown > 0) {
    return counts.completed > 0 ? "partial" : "failed";
  }
  if (counts.blocked > 0) {
    return counts.completed > 0 ? "partial" : "blocked";
  }
  return interrupted ? "pending" : "completed";
}

export async function executeRun(opts: ExecuteOptions): Promise<ExecutionOutcome> {
  const mode = opts.mode ?? "live";
  const summary: RunSummaryLine[] = [];
  const counts: Record<NodeStatus, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
    dispatching: 0,
    unknown: 0,
  };

  const validation = validateGraph(opts.graph, {
    kind: opts.definition.kind,
  });
  if (!validation.ok) {
    return {
      status: "failed",
      summary,
      error: firstError(validation) ?? "This workflow is no longer valid",
      retryable: false,
      leaseLost: false,
      interrupted: false,
      blocked: false,
      drafts: [],
    };
  }

  const byId = new Map(opts.graph.nodes.map((n) => [n.id, n]));
  const trigger = byId.get(opts.input.triggerNodeId);
  if (!trigger) {
    return {
      status: "failed",
      summary,
      error: "That trigger is no longer part of this workflow",
      retryable: false,
      leaseLost: false,
      interrupted: false,
      blocked: false,
      drafts: [],
    };
  }

  const incoming = new Map<string, Inbound[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of opts.graph.edges) {
    incoming.set(edge.target, [
      ...(incoming.get(edge.target) ?? []),
      {
        source: edge.source,
        handle: edge.sourceHandle,
        port: mergeInputIndex(edge.targetHandle),
      },
    ]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }

  const reachable = new Set<string>([trigger.id]);
  const queue = [trigger.id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    for (const next of outgoing.get(id) ?? []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  const mailboxCache = new Map<string, Authorization<AuthorizedMailbox>>();
  const ctx: NodeContext = {
    mode,
    now: opts.now,
    runId: opts.runId,
    signal: opts.signal,
    aiAllowed: (mailboxId: string) => authorizeMailboxAi({ principal: opts.principal, mailboxId }),
    principal: opts.principal,
    definition: opts.definition,
    input: opts.input,
    draft: opts.seedDraft ?? null,
    payload: opts.payload ?? (async () => null),
    mailbox: async (mailboxId: string) => {
      const cached = mailboxCache.get(mailboxId);
      if (cached) return cached;
      const resolved = await authorizeMailbox({
        definition: opts.definition,
        principal: opts.principal,
        mailboxId,
      });
      mailboxCache.set(mailboxId, resolved);
      return resolved;
    },
  };

  const outbox = new Map<string, Envelope[]>();
  const seed: Envelope =
    trigger.kind === "trigger.beforeSend" && opts.seedDraft
      ? {
          port: "draft",
          key: "draft",
          mailboxId: opts.definition.mailboxId ?? "",
          draft: opts.seedDraft,
          lineage: [trigger.id],
        }
      : { port: "signal", key: "trigger", lineage: [trigger.id] };
  outbox.set(outKey(trigger.id, "out"), [seed]);
  const branches = new Map<string, BranchState>([[trigger.id, "settled"]]);

  const drafts: DraftFacts[] = [];
  let retryable = false;
  let interrupted = false;
  let halted = false;
  let runError: string | undefined;

  const persist = mode === "live" && !!opts.runId && !!opts.leaseToken;
  const fence = {
    runId: opts.runId ?? "",
    leaseToken: opts.leaseToken ?? "",
  };

  const leaseLost = (): ExecutionOutcome => ({
    status: "running",
    summary,
    error: "This run's lease moved to another worker",
    retryable: false,
    leaseLost: true,
    interrupted: true,
    blocked: counts.blocked > 0,
    drafts,
  });

  const settleBarrier = async (nodeId: string, inputs: BarrierInput[]): Promise<BranchState> => {
    const holding = inputs.reduce<BranchState>(
      (state, input) => worse(state, input.state),
      "settled",
    );
    if (!persist) return holding;
    const prior = await findNodeRun(fence.runId, nodeId, BARRIER_INPUT_KEY);
    if (prior?.status === "completed") return "settled";
    const id = prior
      ? (await reclaimNodeRun({ ...fence, id: prior.id, status: "running" }))
        ? prior.id
        : null
      : (
          await beginNodeRun({
            ...fence,
            nodeId,
            inputKey: BARRIER_INPUT_KEY,
            status: "running",
          })
        )?.id;
    if (!id) throw new LeaseLostError("lease lost");
    const saved = await finishNodeRun({
      ...fence,
      id,
      status: BARRIER_STATUS[holding],
      output: { inputs },
      error: holding === "settled" ? null : describeHold(inputs, holding),
    });
    if (!saved) throw new LeaseLostError("lease lost");
    return holding;
  };

  const record = (node: WorkflowNode, status: NodeStatus, count: number, detail?: string) => {
    counts[status] += count > 0 ? count : 1;
    summary.push({ nodeId: node.id, kind: node.kind, status, count, detail });
  };

  /* oxlint-disable eslint/no-await-in-loop -- nodes run in topological order and each reads what earlier nodes emitted; each envelope's side effect is fenced and recorded before the next */
  for (const nodeId of validation.order) {
    if (!reachable.has(nodeId) || nodeId === trigger.id) continue;
    const node = byId.get(nodeId);
    if (!node) continue;
    const sideEffect = node.kind.startsWith("action.");

    if (halted) break;
    if (opts.signal?.aborted) {
      retryable = true;
      interrupted = true;
      runError = "The tick ran out of time before this step";
      break;
    }

    const merge = isMergeKind(node.kind);
    const sources = merge
      ? orderMergeInputs(incoming.get(nodeId) ?? [])
      : (incoming.get(nodeId) ?? []);
    const delivered = sources.map((src) => outbox.get(outKey(src.source, src.handle)) ?? []);
    const envelopes = delivered.flat();
    const live = sources.filter((src) => reachable.has(src.source));
    const upstream = live.reduce<BranchState>(
      (state, src) => worse(state, branches.get(src.source) ?? "settled"),
      "settled",
    );

    if (node.kind === "merge.join") {
      const inputs = live.map((src) => ({
        port: src.port,
        state: branches.get(src.source) ?? "settled",
        count: (outbox.get(outKey(src.source, src.handle)) ?? []).length,
      }));
      let barrier: BranchState;
      try {
        barrier = await settleBarrier(nodeId, inputs);
      } catch (err) {
        if (err instanceof LeaseLostError) return leaseLost();
        throw err;
      }
      if (barrier !== "settled") {
        summary.push({
          nodeId: node.id,
          kind: node.kind,
          status: BARRIER_STATUS[barrier],
          count: 0,
          detail: describeHold(inputs, barrier),
        });
        branches.set(nodeId, barrier);
        continue;
      }
      if (envelopes.length === 0) {
        record(node, "skipped", 0, `all ${live.length} input(s) settled with no mail`);
        branches.set(nodeId, "settled");
        continue;
      }
    }

    if (envelopes.length === 0) {
      record(
        node,
        "skipped",
        0,
        upstream === "settled" ? "nothing reached this step" : "an earlier step did not finish",
      );
      branches.set(nodeId, upstream);
      continue;
    }

    if (node.skip) {
      outbox.set(
        outKey(nodeId, "out"),
        envelopes.map((envelope) => ({ ...envelope, lineage: [...envelope.lineage, node.id] })),
      );
      record(node, "skipped", envelopes.length, "this step is skipped in the editor");
      for (const envelope of envelopes) {
        opts.trace?.({
          nodeId,
          envelope,
          status: "skipped",
          outputs: [{ handle: "out", count: 1 }],
          detail: "skipped in the editor",
        });
      }
      branches.set(nodeId, upstream);
      continue;
    }

    if (opts.isCancelled && (await opts.isCancelled())) {
      return {
        status: "cancelled",
        summary,
        retryable: false,
        leaseLost: false,
        interrupted: false,
        blocked: counts.blocked > 0,
        drafts,
      };
    }

    let ok = 0;
    let failedHere = 0;
    const details = new Set<string>();
    let cut = false;
    let own: BranchState = "settled";

    try {
      for (const envelope of envelopes) {
        if (opts.signal?.aborted) {
          retryable = true;
          interrupted = true;
          cut = true;
          own = worse(own, "pending");
          runError = "The tick ran out of time before this step";
          break;
        }

        if (opts.heartbeat && !(await opts.heartbeat())) {
          throw new LeaseLostError("lease lost");
        }

        const inputKey = envelope.key;
        let result: HandlerResult | null = null;
        let nodeRunId: string | null = null;
        let pending: Promise<HandlerResult> | null = null;

        if (persist) {
          const prior = await findNodeRun(fence.runId, nodeId, inputKey);
          if (prior?.status === "completed") {
            const stored = prior.output;
            result = stored
              ? { outputs: stored.outputs ?? [], detail: stored.detail }
              : { outputs: [] };
            ok += 1;
            if (stored?.detail) details.add(stored.detail);
          } else if (prior?.status === "dispatching" || prior?.status === "unknown") {
            const marked = await finishNodeRun({
              ...fence,
              id: prior.id,
              status: "unknown",
              error: "A previous attempt dispatched this step without a conclusive result",
            });
            if (!marked) throw new LeaseLostError("lease lost");
            record(node, "unknown", 1, "needs review");
            failedHere += 1;
            own = worse(own, "failed");
            continue;
          } else if (prior) {
            const reclaimed = await reclaimNodeRun({
              ...fence,
              id: prior.id,
              status: isDispatchNode(node.kind) ? "dispatching" : "running",
            });
            if (!reclaimed) throw new LeaseLostError("lease lost");
            nodeRunId = prior.id;
          } else {
            const started = await beginNodeRun({
              ...fence,
              nodeId,
              inputKey,
              branch: envelope.lineage.at(-1) ?? null,
              status: isDispatchNode(node.kind) ? "dispatching" : "running",
            });
            if (!started) throw new LeaseLostError("lease lost");
            nodeRunId = started.id;
          }
        }

        if (!result) {
          try {
            if (sideEffect && mode === "live") {
              if (
                opts.deadline !== undefined &&
                opts.deadline - Date.now() < (opts.reserveMs ?? 0)
              ) {
                throw new ReserveExhaustedError();
              }
              if (opts.isCancelled && (await opts.isCancelled())) {
                throw new CancelledError();
              }
              const principal = await resolvePrincipal(opts.definition);
              if (!principal.ok) throw new BlockedError(principal.reason);
              if (envelope.port !== "signal") {
                const access = await authorizeMailboxAccess({
                  definition: opts.definition,
                  principal: principal.value,
                  mailboxId: envelope.mailboxId,
                });
                if (!access.ok) throw new BlockedError(access.reason);
              }
            }
            pending = runNode(node, envelope, ctx);
            result = merge ? await pending : await withAbort(pending, opts.signal);
          } catch (err) {
            if (err instanceof CancelledError) {
              if (nodeRunId) {
                const marked = await finishNodeRun({
                  ...fence,
                  id: nodeRunId,
                  status: "skipped",
                  error: "Cancelled before this step started",
                });
                if (!marked) return leaseLost();
              }
              record(node, "skipped", 1, "cancelled before it started");
              return {
                status: "cancelled",
                summary,
                retryable: false,
                leaseLost: false,
                interrupted: false,
                blocked: counts.blocked > 0,
                drafts,
              };
            }
            if (err instanceof ReserveExhaustedError) {
              if (nodeRunId) {
                await finishNodeRun({
                  ...fence,
                  id: nodeRunId,
                  status: "failed",
                  error: err.message,
                });
              }
              retryable = true;
              interrupted = true;
              runError ??= err.message;
              own = worse(own, "pending");
              break;
            }
            if (err instanceof AbortedError) {
              const status: NodeStatus = sideEffect ? "unknown" : "failed";
              if (nodeRunId) {
                await finishNodeRun({
                  ...fence,
                  id: nodeRunId,
                  status,
                  error: err.message,
                });
              }
              if (sideEffect && nodeRunId && pending) {
                reconcileLater(pending, nodeRunId, node, opts.definition);
              }
              record(node, status, 1, err.message);
              failedHere += 1;
              runError ??= err.message;
              own = worse(own, "failed");
              if (sideEffect) halted = true;
              else {
                retryable = true;
                interrupted = true;
              }
              break;
            }
            const blocked = err instanceof BlockedError;
            const message = blocked ? err.message : sanitizeError(err);
            const dispatch = isDispatchNode(node.kind);
            const status: NodeStatus = blocked ? "blocked" : dispatch ? "unknown" : "failed";
            if (nodeRunId) {
              await finishNodeRun({
                ...fence,
                id: nodeRunId,
                status,
                error: message,
                receipt: dispatch ? undefined : receiptFor(undefined, envelope),
              });
            }
            record(node, status, 1, message);
            opts.trace?.({ nodeId, envelope, status, outputs: [], error: message });
            failedHere += 1;
            runError ??= message;
            own = worse(own, blocked ? "blocked" : "failed");
            if (!blocked && !dispatch) retryable = true;
            continue;
          }

          if (nodeRunId) {
            const saved = await finishNodeRun({
              ...fence,
              id: nodeRunId,
              status: "completed",
              output: {
                outputs: redact(result.outputs),
                detail: result.detail,
              },
              outputHandles: result.outputs
                .filter((out) => out.envelopes.length > 0)
                .map((out) => out.handle),
              receipt: receiptFor(result.receipt, envelope),
            });
            if (!saved) throw new LeaseLostError("lease lost");
          }
          ok += 1;
          if (result.detail) details.add(result.detail);
          opts.trace?.({
            nodeId,
            envelope,
            status: "completed",
            outputs: result.outputs.map((out) => ({
              handle: out.handle,
              count: out.envelopes.length,
            })),
            detail: result.detail,
          });
        }

        for (const out of result.outputs) {
          const key = outKey(nodeId, out.handle);
          const existing = outbox.get(key) ?? [];
          const fresh = merge
            ? out.envelopes.filter(
                (produced) => !existing.some((prior) => prior.key === produced.key),
              )
            : out.envelopes;
          outbox.set(key, [...existing, ...fresh]);
          for (const produced of fresh) {
            if (produced.port === "draft") drafts.push(produced.draft);
          }
        }
      }
    } catch (err) {
      if (err instanceof LeaseLostError) return leaseLost();
      throw err;
    }

    branches.set(nodeId, worse(own, upstream));

    if (merge && cut) {
      record(node, "pending", ok, `interrupted after ${ok} of ${envelopes.length} message(s)`);
      continue;
    }
    if (merge && ok > 0) {
      const combined = outbox.get(outKey(nodeId, "out"))?.length ?? 0;
      const active = delivered.filter((items) => items.length > 0).length;
      const folded = envelopes.length - combined;
      const tail = folded > 0 ? `, ${folded} duplicate(s) folded` : "";
      record(
        node,
        "completed",
        ok,
        node.kind === "merge.join"
          ? `released after all ${live.length} input(s) settled: ${combined} message(s)${tail}`
          : `${combined} message(s) from ${active} of ${live.length} input(s)${tail}`,
      );
      continue;
    }
    if (ok > 0) {
      record(node, "completed", ok, details.size > 0 ? [...details].join(", ") : undefined);
    }
    if (ok === 0 && failedHere === 0) record(node, "skipped", 0);
  }
  /* oxlint-enable eslint/no-await-in-loop */

  return {
    status: resolveStatus(counts, interrupted),
    summary,
    error: runError,
    retryable,
    leaseLost: false,
    interrupted,
    blocked: counts.blocked > 0,
    drafts,
  };
}
