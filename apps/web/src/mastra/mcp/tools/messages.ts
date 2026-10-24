import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as mail from "@/mastra/toolkit/mail";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import { listEmailsFields, mailboxTarget, messageTarget } from "@/mastra/toolkit/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listMailboxes = createTool({
  id: "listMailboxes",
  description:
    "List every mailbox connected to one Metis Suite workspace. Returns each mailbox's id, provider, and email address. Call this first to learn which mailboxIds exist in that workspace.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return {
        count: ctx.mailboxes.length,
        mailboxes: ctx.mailboxes.map((m) => ({
          mailboxId: m.mailboxId,
          provider: m.provider,
          email: m.email,
        })),
      };
    }),
});

export const aggregateInbox = createTool({
  id: "aggregateInbox",
  description:
    "Fetch the most recent inbox emails from every mailbox connected to one workspace, merged and tagged with the source mailbox. Use for overviews like 'what needs my attention'.",
  inputSchema: inWorkspace({
    perMailbox: z.number().min(1).max(25).default(8),
  }),
  execute: async ({ workspaceId, perMailbox }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return mail.aggregateInbox(ctx.mailboxes, perMailbox);
    }),
});

export const listEmails = createTool({
  id: "listEmails",
  description:
    "List emails from a folder in one specific connected mailbox. Get mailboxIds from listMailboxes. Pass the returned nextPageToken back as pageToken to fetch the next page.",
  inputSchema: inWorkspace(listEmailsFields),
  execute: async ({ workspaceId, mailboxId, folder, limit, pageToken }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listMessages(r.mailbox, { folder, limit, pageToken });
    }),
});

export const getThread = createTool({
  id: "getThread",
  description:
    "Fetch every email in a conversation thread in a specific mailbox, oldest first. Use the threadId returned by listEmails, aggregateInbox, or searchMail; fetch individual bodies with getEmail.",
  inputSchema: inWorkspace({ ...mailboxTarget, threadId: z.string() }),
  execute: async ({ workspaceId, mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getThread(r.mailbox, threadId);
    }),
});

export const getEmail = createTool({
  id: "getEmail",
  description:
    "Fetch the full plain-text body of an email in a specific mailbox. Provide the mailboxId it belongs to and the email id.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getBody(r.mailbox, id);
    }),
});
