import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import type { OpenAICompatibleLLMConfig } from "@/config/schema";

import type { LlmDriver } from "../types";

export function createOpenAiCompatibleDriver(cfg: OpenAICompatibleLLMConfig): LlmDriver {
  const provider = createOpenAICompatible({
    name: cfg.name ?? "openai-compatible",
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,
    supportsStructuredOutputs: cfg.structuredOutputs,
  });
  return {
    chat: provider(cfg.chatModel),
    smartReply: provider(cfg.smartReplyModel),
    classifier: provider(cfg.classifierModel),
    summary: provider(cfg.summaryModel),
  };
}
