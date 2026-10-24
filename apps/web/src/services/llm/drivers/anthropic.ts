import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";

import type { AnthropicLLMConfig } from "@/config/schema";

import type { LlmDriver } from "../types";

export function createAnthropicDriver(cfg: AnthropicLLMConfig): LlmDriver {
  const provider = createAnthropic({ apiKey: cfg.apiKey });
  return {
    chat: provider(cfg.chatModel),
    smartReply: provider(cfg.smartReplyModel),
    classifier: provider(cfg.classifierModel),
    summary: provider(cfg.summaryModel),
  };
}
