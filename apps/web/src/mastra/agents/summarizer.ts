import "server-only";
import { Agent } from "@mastra/core/agent";

import { getLlm } from "@/services/llm";

export const summarizerAgent = new Agent({
  id: "summarizerAgent",
  name: "Metis Thread Summarizer",
  instructions:
    "You turn email conversations into TL;DR cards: verification codes, meetings, orders, shipments, bills, reservations and a factual text summary when the conversation needs one. Be concrete, no greetings or filler. Per-request system messages tell you whether to build fresh cards or refine existing ones. Reply only with json matching the requested schema.",
  model: () => getLlm().summary,
});
