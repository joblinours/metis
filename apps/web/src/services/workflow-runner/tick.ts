import "server-only";
import { getInstanceConfig } from "@/config/runtime";
import type { TickSummary } from "@/workflow/runtime";
import { runWorkflowTick, type TickOptions } from "@/workflow/tick";

import type { WorkflowRunnerDriverKind } from "./types";

type Field = string | number | boolean | undefined;

export function tickOutcome(summary: TickSummary): "failed" | "worked" | "idle" {
  if (summary.failure) return "failed";
  if (summary.claimed > 0 || summary.discovered > 0) return "worked";
  return "idle";
}

function logfmtValue(value: string | number | boolean): string {
  const text = String(value);
  if (text !== "" && !/[\s"=\\]/.test(text)) return text;
  return JSON.stringify(text);
}

export function logfmt(fields: Record<string, Field>): string {
  return Object.entries(fields)
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${logfmtValue(value)}`]))
    .join(" ");
}

export function reportTick(
  driver: WorkflowRunnerDriverKind,
  summary: TickSummary,
  extra: Record<string, Field> = {},
): void {
  const outcome = tickOutcome(summary);
  const line = `[workflow-runner] tick ${logfmt({
    driver,
    outcome,
    invocation: summary.invocation,
    ...extra,
    started: summary.startedAt,
    durationMs: summary.durationMs,
    discovery: summary.discoverySkipped ? "skipped" : "ran",
    discovered: summary.discovered,
    discoveryErrors: summary.discoveryErrors,
    claimed: summary.claimed,
    completed: summary.completed,
    failed: summary.failed,
    blocked: summary.blocked,
    remaining: summary.remaining,
    stage: summary.failure?.stage,
    code: summary.failure?.code,
  })}`;
  if (outcome === "failed") console.error(line);
  else console.log(line);
}

export async function runTick(
  driver: WorkflowRunnerDriverKind,
  opts: TickOptions = {},
  extra: Record<string, Field> = {},
): Promise<TickSummary> {
  const cfg = getInstanceConfig().workflowRunner;
  const summary = await runWorkflowTick({
    cadenceSec: cfg.cadenceSec,
    budgetMs: cfg.tickBudgetMs,
    batchSize: cfg.batchSize,
    concurrency: cfg.concurrency,
    owner: `${driver}:${process.pid}:${crypto.randomUUID()}`,
    ...opts,
  });
  reportTick(driver, summary, extra);
  return summary;
}
