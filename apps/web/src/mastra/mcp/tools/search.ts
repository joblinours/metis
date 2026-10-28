import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import * as mail from "@/ops/mail";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const searchMail = createTool({
  id: "searchMail",
  description:
    "Search a workspace's connected mailboxes for emails matching a query. Searches every mailbox in that workspace by default; pass mailboxId to search just one. Returns matches tagged with the source mailbox.",
  inputSchema: inWorkspace({
    query: z.string(),
    mailboxId: z.string().optional().describe("Restrict the search to this one mailbox"),
  }),
  execute: async ({ workspaceId, query, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      if (!mailboxId) return mail.searchAcross(ctx.mailboxes, query);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.searchAcross([r.mailbox], query);
    }),
});
