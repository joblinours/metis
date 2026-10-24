import "server-only";
import { z } from "zod";

import { getInstanceConfig } from "@/config/runtime";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";

import type { AiUsageFeature } from "./usage-features";

const tokenCount = z.number().optional().catch(undefined);

const tokenDetailsSchema = z.object({
  cacheReadTokens: tokenCount,
  cacheWriteTokens: tokenCount,
  reasoningTokens: tokenCount,
});

const modelUsageSchema = z.object({
  inputTokens: tokenCount,
  outputTokens: tokenCount,
  totalTokens: tokenCount,
  inputTokenDetails: tokenDetailsSchema.optional().catch(undefined),
  outputTokenDetails: tokenDetailsSchema.optional().catch(undefined),
});

export interface AiUsageEvent {
  userId: string;
  workspaceId?: string | null;
  feature: AiUsageFeature;
  provider?: string;
  model: string;
  usage?: unknown;
  steps?: number;
  finishReason?: string;
  runId?: string;
}

function n(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function recordAiUsage(event: AiUsageEvent): void {
  const parsed = modelUsageSchema.safeParse(event.usage);
  const usage = parsed.success ? parsed.data : undefined;
  const inputTokens = n(usage?.inputTokens);
  const outputTokens = n(usage?.outputTokens);

  void db
    .insert(aiUsage)
    .values({
      id: crypto.randomUUID(),
      userId: event.userId,
      workspaceId: event.workspaceId ?? null,
      feature: event.feature,
      provider: event.provider ?? getInstanceConfig().llm.driver,
      model: event.model,
      inputTokens,
      outputTokens,
      totalTokens: n(usage?.totalTokens) || inputTokens + outputTokens,
      cacheReadTokens: n(usage?.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: n(usage?.inputTokenDetails?.cacheWriteTokens),
      reasoningTokens: n(usage?.outputTokenDetails?.reasoningTokens),
      steps: event.steps ?? 1,
      finishReason: event.finishReason ?? null,
      runId: event.runId ?? null,
    })
    .catch((err) => {
      console.error("[ai-usage]", err);
    });
}
