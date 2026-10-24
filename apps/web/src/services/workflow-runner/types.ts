import type { TickSummary } from "@/workflow/runtime";
import type { TickOptions } from "@/workflow/tick";

export type WorkflowRunnerDriverKind = "bullmq" | "cron" | "internal";

export interface RunnerReadiness {
  driver: WorkflowRunnerDriverKind;
  database: boolean;
  transport: boolean;
  scheduled: boolean;
  detail?: string;
}

export interface WorkflowRunnerDriver {
  readonly kind: WorkflowRunnerDriverKind;
  start(): Promise<void>;
  stop(): Promise<void>;
  tick(opts?: TickOptions): Promise<TickSummary>;
  ready(): Promise<RunnerReadiness>;
}
