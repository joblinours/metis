import "server-only";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { APICallError, wrapLanguageModel } from "ai";

import { isRecord } from "@/lib/guards";

import type { LlmDriver } from "./types";

const TRIP_AFTER = 3;
const OPEN_MS = 5 * 60 * 1000;
const GENERATE_TIMEOUT_MS = 120_000;

let consecutiveFailures = 0;
let openUntil = 0;

export class LlmUnavailableError extends Error {
  constructor() {
    super("The AI model is not answering right now. Try again in a few minutes.");
    this.name = "LlmUnavailableError";
  }
}

export function llmUnavailable(): boolean {
  return Date.now() < openUntil;
}

function isUnavailable(err: unknown): boolean {
  if (APICallError.isInstance(err)) return true;
  if (isRecord(err) && (err.name === "TimeoutError" || err.message === "fetch failed")) {
    return true;
  }
  return false;
}

function settle(err: unknown, callerAborted: boolean) {
  if (err === undefined) {
    consecutiveFailures = 0;
    return;
  }
  if (callerAborted || !isUnavailable(err)) return;
  consecutiveFailures += 1;
  if (consecutiveFailures >= TRIP_AFTER && !llmUnavailable()) {
    openUntil = Date.now() + OPEN_MS;
    console.warn(
      `[llm] ${consecutiveFailures} model calls failed in a row; skipping model calls for ${OPEN_MS / 60_000} min`,
    );
  }
}

async function guarded<T>(run: () => PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> {
  if (llmUnavailable()) throw new LlmUnavailableError();
  try {
    const result = await run();
    settle(undefined, false);
    return result;
  } catch (err) {
    const timedOut = isRecord(signal?.reason) && signal.reason.name === "TimeoutError";
    settle(err, (signal?.aborted ?? false) && !timedOut);
    throw err;
  }
}

function guardModel(model: LanguageModelV4): LanguageModelV4 {
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v4",
      transformParams: async ({ type, params }) => {
        if (type !== "generate") return params;
        const timeout = AbortSignal.timeout(GENERATE_TIMEOUT_MS);
        return {
          ...params,
          abortSignal: params.abortSignal
            ? AbortSignal.any([params.abortSignal, timeout])
            : timeout,
        };
      },
      wrapGenerate: ({ doGenerate, params }) => guarded(doGenerate, params.abortSignal),
      wrapStream: ({ doStream, params }) => guarded(doStream, params.abortSignal),
    },
  });
}

export function guardDriver(driver: LlmDriver): LlmDriver {
  return {
    chat: guardModel(driver.chat),
    smartReply: guardModel(driver.smartReply),
    classifier: guardModel(driver.classifier),
    summary: guardModel(driver.summary),
  };
}
