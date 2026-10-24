import "server-only";
import type { InternalRunnerConfig } from "@/config/schema";
import { errorCode } from "@/workflow/diagnostics";
import { tickState } from "@/workflow/store";

import { logfmt, runTick } from "../tick";
import type { RunnerReadiness, WorkflowRunnerDriver } from "../types";

interface LoopState {
  timer: ReturnType<typeof setInterval> | null;
  active: Promise<void> | null;
  controller: AbortController | null;
}

declare global {
  var $metisInternalRunner: LoopState | undefined;
}

function loopState(): LoopState {
  globalThis.$metisInternalRunner ??= {
    timer: null,
    active: null,
    controller: null,
  };
  return globalThis.$metisInternalRunner;
}

export function createInternalDriver(cfg: InternalRunnerConfig): WorkflowRunnerDriver {
  const state = loopState();

  const fire = (trigger: "start" | "interval") => {
    if (state.active) {
      console.log(
        `[workflow-runner] internal tick skipped ${logfmt({ trigger, reason: "tick-active" })}`,
      );
      return;
    }
    const controller = new AbortController();
    state.controller = controller;
    state.active = runTick("internal", { signal: controller.signal }, { trigger })
      .then(
        () => undefined,
        (err) => {
          console.error(
            `[workflow-runner] internal tick threw ${logfmt({ code: errorCode(err) })}`,
          );
        },
      )
      .finally(() => {
        state.active = null;
        state.controller = null;
      });
  };

  return {
    kind: "internal",

    async start() {
      if (state.timer) return;
      state.timer = setInterval(() => fire("interval"), cfg.cadenceSec * 1000);
      state.timer.unref();
      console.log(
        `[workflow-runner] internal started ${logfmt({
          pid: process.pid,
          cadenceSec: cfg.cadenceSec,
          budgetMs: cfg.tickBudgetMs,
          batch: cfg.batchSize,
          concurrency: cfg.concurrency,
        })}`,
      );
      fire("start");
    },

    async stop() {
      const wasRunning = state.timer !== null;
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
      const active = state.active;
      if (!active) {
        if (wasRunning) console.log("[workflow-runner] internal stopped");
        return;
      }

      const startedAt = Date.now();
      state.controller?.abort();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const settled = await Promise.race([
        active.then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), cfg.tickBudgetMs);
          timeout.unref();
        }),
      ]);
      clearTimeout(timeout);
      console.log(
        `[workflow-runner] internal stopped ${logfmt({
          durationMs: Date.now() - startedAt,
          activeTick: settled ? "settled" : "abandoned",
        })}`,
      );
    },

    tick: (opts) => runTick("internal", opts),

    async ready(): Promise<RunnerReadiness> {
      const readiness: RunnerReadiness = {
        driver: "internal",
        database: false,
        transport: true,
        scheduled: state.timer !== null,
      };
      try {
        await tickState();
        readiness.database = true;
      } catch (err) {
        readiness.detail = `database:${errorCode(err)}`;
      }
      return readiness;
    },
  };
}
