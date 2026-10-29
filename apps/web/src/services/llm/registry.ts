import "server-only";
import { sectionCached } from "@/config/runtime";
import type { LlmConfig } from "@/config/schema";

import { createAnthropicDriver } from "./drivers/anthropic";
import { createDisabledDriver } from "./drivers/disabled";
import { createOpenAiDriver } from "./drivers/openai";
import { createOpenAiCompatibleDriver } from "./drivers/openai-compatible";
import { guardDriver } from "./guard";
import type { LlmDriver } from "./types";

function buildDriver(cfg: LlmConfig): LlmDriver {
  switch (cfg.driver) {
    case "openai":
      return guardDriver(createOpenAiDriver(cfg));
    case "anthropic":
      return guardDriver(createAnthropicDriver(cfg));
    case "openai-compatible":
      return guardDriver(createOpenAiCompatibleDriver(cfg));
    case "disabled":
      return createDisabledDriver();
  }
}

export const getLlm: () => LlmDriver = sectionCached(["llm"], (cfg) => buildDriver(cfg.llm));
