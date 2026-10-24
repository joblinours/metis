import "server-only";
import { sectionCached } from "@/config/runtime";
import type { DecisionConfig } from "@/config/schema";

import { createDisabledDecisionDriver } from "./drivers/disabled";
import { createOpenAiDecisionDriver } from "./drivers/openai";
import { createSystemOneDriver } from "./drivers/systemone";
import type { DecisionDriver } from "./types";

function buildDriver(cfg: DecisionConfig): DecisionDriver {
  switch (cfg.driver) {
    case "systemone":
      return createSystemOneDriver(cfg);
    case "openai":
      return createOpenAiDecisionDriver(cfg);
    case "disabled":
      return createDisabledDecisionDriver();
  }
}

export const getDecision: () => DecisionDriver = sectionCached(["decision"], (cfg) =>
  buildDriver(cfg.decision),
);
