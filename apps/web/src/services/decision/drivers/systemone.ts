import "server-only";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";

import type { SystemOneDecisionConfig } from "@/config/schema";

import type { DecisionDriver } from "../types";

const KEYLESS_PLACEHOLDER = "metis-keyless";

export function createSystemOneDriver(cfg: SystemOneDecisionConfig): DecisionDriver {
  const provider = createTypeSafeAi({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey ?? KEYLESS_PLACEHOLDER,
  });
  return { kind: "systemone", model: provider.decisionModel(cfg.model) };
}
