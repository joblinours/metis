import { type ChildProcess, fork } from "node:child_process";
import { createWriteStream } from "node:fs";

const WORKER = new URL("./worker.ts", import.meta.url).pathname;

export type WorkerMessage =
  | { type: "settle" }
  | { type: "done"; ok: true }
  | { type: "done"; ok: false; error: string };

export interface WorkerResult {
  ok: boolean;
  error?: string;
  timedOut: boolean;
}

const children = new Set<ChildProcess>();

export function killWorkers(): void {
  for (const child of children) child.kill("SIGKILL");
}

export function runWorker(options: {
  env: NodeJS.ProcessEnv;
  logPath: string;
  timeoutMs: number;
  settle: () => Promise<void>;
}): Promise<WorkerResult> {
  return new Promise((resolve) => {
    const log = createWriteStream(options.logPath);
    const child = fork(WORKER, [], {
      execArgv: process.execArgv.filter((arg) => !arg.startsWith("--env-file")),
      env: options.env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    children.add(child);
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });

    let result: WorkerMessage | undefined;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.on("message", (message: WorkerMessage) => {
      if (message.type === "settle") {
        void options.settle().then(() => {
          if (child.connected) child.send({ type: "settled" });
        });
        return;
      }
      result = message;
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      log.end();
      if (timedOut) {
        resolve({
          ok: false,
          timedOut,
          error: `timed out after ${options.timeoutMs / 60_000} min`,
        });
      } else if (result?.type === "done" && result.ok && code === 0) {
        resolve({ ok: true, timedOut });
      } else if (result?.type === "done" && !result.ok) {
        resolve({ ok: false, timedOut, error: result.error });
      } else {
        resolve({
          ok: false,
          timedOut,
          error: `worker exited with ${signal ?? `code ${code}`} before reporting`,
        });
      }
    });
  });
}
