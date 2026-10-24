import "server-only";
import { Agent } from "@mastra/core/agent";

import { getLlm } from "@/services/llm";

export const drafterAgent = new Agent({
  id: "drafterAgent",
  name: "Metis Reply Drafter",
  instructions:
    "You draft short, natural email replies and reply suggestions. You write plain prose with no greeting, no signature, and no placeholders like [Name]. You match the sender's tone and stay specific to the email's content. Per-request system messages give you the exact stance, tone, and format to produce. Reply only with json matching the requested schema.",
  model: () => getLlm().smartReply,
});
