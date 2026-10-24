import "server-only";
import { Agent } from "@mastra/core/agent";

import { getLlm } from "@/services/llm";

export const classifierAgent = new Agent({
  id: "classifierAgent",
  name: "Metis Label Classifier",
  instructions:
    "You classify emails into exactly one category each, using only the category keys provided in the prompt. You echo back the exact ref token for every email and return a confidence score from 0-100. Reply only with json matching the requested schema.",
  model: () => getLlm().classifier,
});
