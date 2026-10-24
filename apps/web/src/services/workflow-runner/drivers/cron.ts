import "server-only";
import type { CronRunnerConfig } from "@/config/schema";
import { errorCode } from "@/workflow/diagnostics";
import { tickState } from "@/workflow/store";

import { runTick } from "../tick";
import type { RunnerReadiness, WorkflowRunnerDriver } from "../types";

export function createCronDriver(cfg: CronRunnerConfig): WorkflowRunnerDriver {
  return {
    kind: "cron",

    async start() {
      console.log(
        `[workflow-runner] cron — POST /api/workflows/tick at least every ${cfg.cadenceSec}s with X-Metis-Secret`,
      );
    },

    async stop() {},

    tick(opts) {
      return runTick("cron", opts);
    },

    async ready(): Promise<RunnerReadiness> {
      try {
        await tickState();
        return {
          driver: "cron",
          database: true,
          transport: true,
          scheduled: true,
        };
      } catch (err) {
        return {
          driver: "cron",
          database: false,
          transport: true,
          scheduled: false,
          detail: `database:${errorCode(err)}`,
        };
      }
    },
  };
}
