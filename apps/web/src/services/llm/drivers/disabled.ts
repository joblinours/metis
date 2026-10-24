import "server-only";
import type { LanguageModelV4 } from "@ai-sdk/provider";

import type { LlmDriver } from "../types";

function unreachable(): never {
  throw new Error(
    "AI is disabled (METIS_LLM_DRIVER=disabled) — this call should have been gated before reaching the model",
  );
}

function disabledModel(modelId: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "disabled",
    modelId,
    supportedUrls: {},
    doGenerate: unreachable,
    doStream: unreachable,
  };
}

export function createDisabledDriver(): LlmDriver {
  return {
    chat: disabledModel("disabled-chat"),
    smartReply: disabledModel("disabled-smart-reply"),
    classifier: disabledModel("disabled-classifier"),
    summary: disabledModel("disabled-summary"),
  };
}
