import "server-only";
import { createOpenAI } from "@ai-sdk/openai";

import type { OpenAIDecisionConfig } from "@/config/schema";

import type { DecisionDriver } from "../types";

export function createOpenAiDecisionDriver(cfg: OpenAIDecisionConfig): DecisionDriver {
  const provider = createOpenAI({ apiKey: cfg.apiKey });
  return { kind: "openai", model: provider.decisionModel(cfg.model) };
}
