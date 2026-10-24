import "server-only";
import { getInstanceConfig } from "@/config/runtime";
import { errorCode } from "@/workflow/diagnostics";

import { getWorkflowRunner } from "./registry";
import type { WorkflowRunnerDriver } from "./types";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;

interface InProcessState {
  running: WorkflowRunnerDriver | null;
  queue: Promise<void>;
}

declare global {
  var $metisInProcessRunner: InProcessState | undefined;
  var $metisRunnerSignals: boolean | undefined;
}

function inProcessState(): InProcessState {
  globalThis.$metisInProcessRunner ??= {
    running: null,
    queue: Promise.resolve(),
  };
  return globalThis.$metisInProcessRunner;
}

function listenForShutdown(): void {
  if (globalThis.$metisRunnerSignals) return;
  globalThis.$metisRunnerSignals = true;
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      const alone = process.listenerCount(signal) === 0;
      console.log(
        `[workflow-runner] internal shutdown signal=${signal} — stopping the active tick`,
      );
      stopRunning()
        .catch((err) => {
          console.error(`[workflow-runner] internal stop failed code=${errorCode(err)}`);
        })
        .finally(() => {
          if (alone) process.kill(process.pid, signal);
        });
    });
  }
}

async function stopRunning(): Promise<void> {
  const state = inProcessState();
  const driver = state.running;
  state.running = null;
  if (driver) await driver.stop();
}

async function startIfInternal(): Promise<void> {
  if (getInstanceConfig().workflowRunner.driver !== "internal") return;
  listenForShutdown();
  const state = inProcessState();
  const driver = getWorkflowRunner();
  state.running = driver;
  await driver.start();
}

function serialized(run: () => Promise<void>): Promise<void> {
  const state = inProcessState();
  const next = state.queue.then(run, run);
  state.queue = next.catch(() => {});
  return next;
}

export function startInProcessRunner(): Promise<void> {
  return serialized(startIfInternal);
}

export function syncInProcessRunner(): Promise<void> {
  return serialized(async () => {
    await stopRunning();
    await startIfInternal();
  });
}
