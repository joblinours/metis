import "server-only";
import { createTool } from "@mastra/core/tools";

import { analyzePhishing as runAnalysis } from "@/mastra/toolkit/phishing";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import { messageTarget } from "@/mastra/toolkit/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const analyzePhishing = createTool({
  id: "analyzePhishing",
  description:
    "Run the phishing-detection engine on an email in a specific mailbox. Returns classification, risk score, confidence, and reasons.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return runAnalysis({ mailbox: r.mailbox, userId: ctx.userId, id });
    }),
});
