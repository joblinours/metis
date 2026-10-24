import "server-only";
import { getInstanceConfig } from "@/config/runtime";
import { sanitizeError } from "@/lib/errors/sanitize-error";

import { resolvePrincipal } from "./authorization";
import { ensureSystemWorkflows } from "./builtins/system";
import { errorCode, formatTickFailure, tickFailure } from "./diagnostics";
import { executeRun } from "./executor";
import { finishPendingResolutions } from "./reconcile";
import type { RunSummaryLine, TickFailure, TickStage, TickSummary } from "./runtime";
import type { RunStatus } from "./schema";
import {
  claimDiscovery,
  claimRun,
  claimRuns,
  closeStrandedCancels,
  dropPayload,
  dueTriggers,
  expireRetainedOutputs,
  getPayload,
  heartbeatRun,
  isResumableKind,
  loadRevision,
  pendingRunCount,
  type RunRow,
  recordTick,
  redactSentOutputs,
  releaseDiscovery,
  releaseRun,
  runIsCancelled,
  runTriggerKind,
  sendReceipted,
  settleRun,
} from "./store";
import { discoverTrigger } from "./triggers";

const MAX_ATTEMPTS = 5;
const BLOCKED_RETRY_MS = 600_000;
const RUN_LEASE_MS = 120_000;
const DISCOVERY_LEASE_MS = 120_000;
const TRIGGER_PAGE = 50;
const MUTATION_RESERVE_MS = 15_000;

function mutationReserve(budgetMs: number): number {
  return Math.min(MUTATION_RESERVE_MS, Math.floor(budgetMs / 3));
}

export interface TickOptions {
  now?: Date;
  signal?: AbortSignal;
  budgetMs?: number;
  batchSize?: number;
  concurrency?: number;
  cadenceSec?: number;
  owner?: string;
}

function backoffMs(attempts: number): number {
  const base = Math.min(15_000 * 2 ** Math.max(0, attempts - 1), 1_800_000);
  return base + Math.floor(Math.random() * 5_000);
}

type Clock = () => Date;

class PrincipalBlocked extends Error {}

async function runOne(
  run: RunRow,
  signal: AbortSignal,
  deadline: number,
  reserveMs: number,
  clock: Clock,
): Promise<RunStatus> {
  const token = run.leaseToken;
  if (!token) return "failed";

  const loaded = await loadRevision(run.revisionId);
  if (!loaded) {
    await settleRun({
      runId: run.id,
      token,
      status: "failed",
      error: "That workflow revision no longer exists",
      retainOutputs: false,
    });
    return "failed";
  }

  const principal = await resolvePrincipal(loaded.definition);

  let summary: RunSummaryLine[] = [];
  let status: RunStatus = "failed";
  let error: string | undefined;
  let retryable = false;
  let blockedNode = false;
  let interrupted = false;

  if (!principal.ok) {
    status = "blocked";
    error = principal.reason;
    blockedNode = true;
  }

  try {
    if (!principal.ok) throw new PrincipalBlocked();
    const outcome = await executeRun({
      runId: run.id,
      leaseToken: token,
      definition: loaded.definition,
      graph: loaded.graph,
      principal: principal.value,
      input: run.input,
      now: clock(),
      signal,
      deadline,
      reserveMs,
      payload: () => getPayload(run.workflowId),
      isCancelled: () => runIsCancelled(run.id),
      heartbeat: () => heartbeatRun(run.id, token, new Date(Date.now() + RUN_LEASE_MS)),
    });
    if (outcome.leaseLost) return "pending";
    summary = outcome.summary;
    status = outcome.status;
    error = outcome.error;
    retryable = outcome.retryable;
    blockedNode = outcome.blocked;
    interrupted = outcome.interrupted;
  } catch (err) {
    if (!(err instanceof PrincipalBlocked)) {
      error = sanitizeError(err);
      retryable = true;
    }
  }

  const oneShot = run.kind === "scheduled-send" || run.kind === "snooze";
  const blocked = blockedNode && oneShot;
  const shouldRetry = retryable && run.attempts < MAX_ATTEMPTS;
  const retryAt = interrupted
    ? clock()
    : blocked
      ? new Date(clock().getTime() + BLOCKED_RETRY_MS)
      : shouldRetry
        ? new Date(clock().getTime() + backoffMs(run.attempts))
        : null;

  let transition: "enable" | "retire" | undefined;
  if (run.kind === "snooze" && status === "completed" && !retryAt) {
    const kind = await runTriggerKind(run.id);
    if (kind === "trigger.manual") transition = "enable";
    else if (kind === "trigger.once") transition = "retire";
  }

  const settled = await settleRun({
    runId: run.id,
    token,
    status,
    error: error ?? null,
    summary,
    retryAt,
    restoreAttempt: blocked || interrupted,
    retainOutputs: isResumableKind(run.kind),
    definition: transition,
    blocked: blockedNode,
  });
  if (!settled) return "pending";

  if (run.kind === "scheduled-send" && (await sendReceipted(run.id))) {
    await dropPayload(run.workflowId);
    await redactSentOutputs(run.id);
  }

  return retryAt ? "pending" : status;
}

async function drain(
  runs: RunRow[],
  concurrency: number,
  deadline: number,
  reserveMs: number,
  signal: AbortSignal,
  clock: Clock,
  tally: { completed: number; failed: number; blocked: number },
): Promise<void> {
  let cursor = 0;
  const errors: unknown[] = [];
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, runs.length)) },
    async () => {
      while (cursor < runs.length) {
        const run = runs[cursor];
        cursor += 1;
        if (!run) return;
        try {
          /* oxlint-disable eslint/no-await-in-loop -- each worker takes the next run only after its current one settles; concurrency is the worker count */
          if (Date.now() > deadline || signal.aborted) {
            await releaseRun(run);
            continue;
          }
          const status = await runOne(run, signal, deadline, reserveMs, clock);
          /* oxlint-enable eslint/no-await-in-loop */
          if (status === "completed") tally.completed += 1;
          else if (status === "blocked") tally.blocked += 1;
          else if (status !== "pending") tally.failed += 1;
        } catch (error) {
          errors.push(error);
        }
      }
    },
  );
  await Promise.all(workers);
  if (errors.length > 0) throw errors[0];
}

export async function runWorkflowTick(opts: TickOptions = {}): Promise<TickSummary> {
  const runner = getInstanceConfig().workflowRunner;
  const startedAt = Date.now();
  const now = opts.now ?? new Date();
  const budgetMs = opts.budgetMs ?? runner.tickBudgetMs;
  const batchSize = opts.batchSize ?? runner.batchSize;
  const concurrency = opts.concurrency ?? runner.concurrency;
  const cadenceSec = opts.cadenceSec ?? runner.cadenceSec;
  const owner = opts.owner ?? `${process.pid}:${crypto.randomUUID()}`;
  const deadline = startedAt + budgetMs;
  const clock: Clock = () => new Date(now.getTime() + (Date.now() - startedAt));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort);

  const tally = { completed: 0, failed: 0, blocked: 0 };
  let discovered = 0;
  let discoveryErrors = 0;
  let claimed = 0;
  let discoverySkipped = true;
  let stage: TickStage = "setup";
  let failure: TickFailure | undefined;

  try {
    await ensureSystemWorkflows();

    const token = await claimDiscovery({
      now,
      cadenceSec,
      owner,
      leaseMs: DISCOVERY_LEASE_MS,
    });

    if (token) {
      discoverySkipped = false;
      stage = "discovery";
      try {
        const due = await dueTriggers(now, TRIGGER_PAGE);
        for (const trigger of due) {
          if (Date.now() > deadline || controller.signal.aborted) break;
          try {
            // oxlint-disable-next-line eslint/no-await-in-loop -- triggers are discovered one at a time so the tick can stop at its deadline
            const result = await discoverTrigger(trigger, now, cadenceSec, controller.signal);
            discovered += result.created;
            if (result.error) discoveryErrors += 1;
          } catch (err) {
            discoveryErrors += 1;
            console.error(
              `[workflow] discovery failed invocation=${owner} workflow=${trigger.definition.id} code=${errorCode(err)}`,
            );
          }
        }
        await releaseDiscovery(token, null);
      } catch (err) {
        failure = tickFailure("discovery", err);
        await releaseDiscovery(token, formatTickFailure(failure));
      }
    }

    stage = "maintenance";
    await closeStrandedCancels(clock());
    await expireRetainedOutputs(clock());
    await finishPendingResolutions(clock());

    stage = "execution";
    /* oxlint-disable eslint/no-await-in-loop -- claims the next batch only after the current one drains, until the tick deadline */
    while (Date.now() < deadline && !controller.signal.aborted) {
      const runs = await claimRuns({
        now: clock(),
        limit: batchSize,
        owner,
        leaseMs: RUN_LEASE_MS,
      });
      if (runs.length === 0) break;
      claimed += runs.length;
      await drain(
        runs,
        concurrency,
        deadline,
        mutationReserve(budgetMs),
        controller.signal,
        clock,
        tally,
      );
      if (runs.length < batchSize) break;
    }
    /* oxlint-enable eslint/no-await-in-loop */
  } catch (err) {
    failure = tickFailure(stage, err);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }

  const error = failure ? formatTickFailure(failure) : undefined;
  const remaining = await pendingRunCount(clock()).catch(() => 0);
  await recordTick(clock(), error ?? null).catch((err) => {
    console.error(
      `[workflow] could not record tick health invocation=${owner} code=${errorCode(err)}`,
    );
  });

  return {
    invocation: owner,
    startedAt: new Date(startedAt).toISOString(),
    discovered,
    discoveryErrors,
    claimed,
    completed: tally.completed,
    failed: tally.failed,
    blocked: tally.blocked,
    remaining,
    discoverySkipped,
    durationMs: Date.now() - startedAt,
    failure,
    error,
  };
}

export async function runNow(runId: string): Promise<RunStatus> {
  const target = await claimRun({
    runId,
    now: new Date(),
    owner: `inline:${crypto.randomUUID()}`,
    leaseMs: RUN_LEASE_MS,
  });
  if (!target) return "pending";

  const budget = getInstanceConfig().workflowRunner.tickBudgetMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  try {
    return await runOne(
      target,
      controller.signal,
      Date.now() + budget,
      mutationReserve(budget),
      () => new Date(),
    );
  } finally {
    clearTimeout(timer);
  }
}
