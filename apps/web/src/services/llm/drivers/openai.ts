import "server-only";
import { createOpenAI } from "@ai-sdk/openai";

import type { OpenAILLMConfig } from "@/config/schema";

import type { LlmDriver } from "../types";

export function createOpenAiDriver(cfg: OpenAILLMConfig): LlmDriver {
  const provider = createOpenAI({ apiKey: cfg.apiKey });
  return {
    chat: provider.chat(cfg.chatModel),
    smartReply: provider.chat(cfg.smartReplyModel),
    classifier: provider.chat(cfg.classifierModel),
    summary: provider.chat(cfg.summaryModel),
  };
}
