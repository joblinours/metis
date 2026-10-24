import "server-only";
import { sectionCached } from "@/config/runtime";
import type { WorkflowRunnerConfig } from "@/config/schema";

import { createBullmqDriver } from "./drivers/bullmq";
import { createCronDriver } from "./drivers/cron";
import { createInternalDriver } from "./drivers/internal";
import type { WorkflowRunnerDriver } from "./types";

export function buildWorkflowRunner(cfg: WorkflowRunnerConfig): WorkflowRunnerDriver {
  switch (cfg.driver) {
    case "bullmq":
      return createBullmqDriver(cfg);
    case "cron":
      return createCronDriver(cfg);
    case "internal":
      return createInternalDriver(cfg);
  }
}

export const getWorkflowRunner: () => WorkflowRunnerDriver = sectionCached(
  ["workflowRunner"],
  (cfg) => buildWorkflowRunner(cfg.workflowRunner),
);
