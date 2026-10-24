import "server-only";
import { type ConnectionOptions, type Job, Queue, Worker } from "bullmq";

import type { BullmqRunnerConfig } from "@/config/schema";
import { errorCode, formatTickFailure } from "@/workflow/diagnostics";
import type { TickFailure, TickSummary } from "@/workflow/runtime";
import { tickState } from "@/workflow/store";

import { logfmt, runTick } from "../tick";
import type { RunnerReadiness, WorkflowRunnerDriver } from "../types";

const QUEUE_NAME = "workflow-tick";
const SCHEDULER_ID = "workflow-cadence";
const TICK_ATTEMPTS = 3;
const REPEAT_ERROR_WINDOW_MS = 60_000;

class TickFailedError extends Error {
  readonly failure: TickFailure;

  constructor(failure: TickFailure) {
    super(formatTickFailure(failure));
    this.name = "TickFailedError";
    this.failure = failure;
  }
}

export function createBullmqDriver(cfg: BullmqRunnerConfig): WorkflowRunnerDriver {
  let queue: Queue | null = null;
  let worker: Worker | null = null;
  let scheduled = false;
  const lastLogged = new Map<string, number>();

  const connection = (): ConnectionOptions => ({
    url: cfg.redisUrl,
    maxRetriesPerRequest: null,
  });

  const transportError = (source: "queue" | "worker") => (err: Error) => {
    const code = errorCode(err);
    const key = `${source}:${code}`;
    const now = Date.now();
    if (now - (lastLogged.get(key) ?? 0) < REPEAT_ERROR_WINDOW_MS) return;
    lastLogged.set(key, now);
    console.error(
      `[workflow-runner] redis ${logfmt({ source, code, repeatsSuppressedFor: `${REPEAT_ERROR_WINDOW_MS / 1000}s` })}`,
    );
  };

  return {
    kind: "bullmq",

    async start() {
      if (queue) return;

      queue = new Queue(QUEUE_NAME, {
        connection: connection(),
        prefix: cfg.queuePrefix,
      });
      queue.on("error", transportError("queue"));

      await queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: cfg.cadenceSec * 1000 },
        {
          name: "tick",
          opts: {
            attempts: TICK_ATTEMPTS,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        },
      );
      scheduled = true;

      worker = new Worker(
        QUEUE_NAME,
        async (job: Job): Promise<TickSummary> => {
          const summary = await runTick(
            "bullmq",
            {},
            { job: job.id, attempt: job.attemptsMade + 1 },
          );
          if (summary.failure) {
            throw new TickFailedError(summary.failure);
          }
          return summary;
        },
        {
          connection: connection(),
          prefix: cfg.queuePrefix,
          concurrency: 1,
          lockDuration: cfg.tickBudgetMs + 30_000,
        },
      );

      worker.on("error", transportError("worker"));
      worker.on("failed", (job, err) => {
        const attempts = job?.attemptsMade ?? 0;
        const max = job?.opts.attempts ?? TICK_ATTEMPTS;
        console.error(
          `[workflow-runner] tick job failed ${logfmt({
            job: job?.id,
            attempt: attempts,
            of: max,
            next: attempts < max ? "retry" : "next-cadence",
            ...(err instanceof TickFailedError
              ? { stage: err.failure.stage, code: err.failure.code }
              : { code: errorCode(err) }),
          })}`,
        );
      });

      console.log(
        `[workflow-runner] bullmq started ${logfmt({
          queue: `${cfg.queuePrefix}:${QUEUE_NAME}`,
          scheduler: SCHEDULER_ID,
          cadenceSec: cfg.cadenceSec,
          budgetMs: cfg.tickBudgetMs,
        })}`,
      );
    },

    async stop() {
      const startedAt = Date.now();
      const closing: Promise<unknown>[] = [];
      if (worker) closing.push(worker.close());
      if (queue) closing.push(queue.close());
      await Promise.allSettled(closing);
      worker = null;
      queue = null;
      scheduled = false;
      console.log(
        `[workflow-runner] bullmq stopped ${logfmt({ durationMs: Date.now() - startedAt })}`,
      );
    },

    tick: (opts) => runTick("bullmq", opts),

    async ready(): Promise<RunnerReadiness> {
      const readiness: RunnerReadiness = {
        driver: "bullmq",
        database: false,
        transport: false,
        scheduled,
      };
      const problems: string[] = [];
      try {
        await tickState();
        readiness.database = true;
      } catch (err) {
        problems.push(`database:${errorCode(err)}`);
      }
      try {
        if (queue) {
          await queue.waitUntilReady();
          readiness.transport = true;
          readiness.scheduled = (await queue.getJobSchedulersCount()) > 0;
        }
      } catch (err) {
        problems.push(`redis:${errorCode(err)}`);
      }
      if (problems.length > 0) readiness.detail = problems.join(",");
      return readiness;
    },
  };
}
