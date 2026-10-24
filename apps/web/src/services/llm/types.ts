import type { LanguageModelV4 } from "@ai-sdk/provider";

export type LlmDriverKind = "openai" | "anthropic" | "openai-compatible" | "disabled";

export interface LlmDriver {
  chat: LanguageModelV4;
  smartReply: LanguageModelV4;
  classifier: LanguageModelV4;
  summary: LanguageModelV4;
}
