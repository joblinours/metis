import "server-only";
import { Mastra } from "@mastra/core/mastra";

import { calendarAgent } from "./agents/calendar-agent";
import { classifierAgent } from "./agents/classifier";
import { drafterAgent } from "./agents/drafter";
import { driveAgent } from "./agents/drive-agent";
import { mailboxAgent } from "./agents/mailbox-agent";
import { summarizerAgent } from "./agents/summarizer";
import { workspaceAgent } from "./agents/workspace-agent";
import { storage } from "./storage";

export const mastra = new Mastra({
  agents: {
    mailboxAgent,
    calendarAgent,
    driveAgent,
    workspaceAgent,
    drafterAgent,
    summarizerAgent,
    classifierAgent,
  },
  storage,
});
