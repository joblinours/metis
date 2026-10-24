import "server-only";
import { createTool } from "@mastra/core/tools";

import * as mail from "@/mastra/toolkit/mail";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  attachmentTarget,
  contactSearchFields,
  messageTarget,
  summarizeThreadFields,
} from "@/mastra/toolkit/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const listAttachments = createTool({
  id: "listAttachments",
  description:
    "List the attachments on an email in a specific mailbox — attachmentId, filename, type and size.",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listAttachments(r.mailbox, id);
    }),
});

export const getAttachmentText = createTool({
  id: "getAttachmentText",
  description:
    "Read an email attachment as text: PDFs, calendar invites, contact cards, wallet passes and forwarded emails come back as extracted data, plain-text files as their text. Get the attachmentId from listAttachments.",
  inputSchema: inWorkspace(attachmentTarget),
  execute: async ({ workspaceId, mailboxId, id, attachmentId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getAttachmentText(r.mailbox, id, attachmentId);
    }),
});

export const searchContacts = createTool({
  id: "searchContacts",
  description:
    "Look up people this mailbox writes to and hears from, most frequent first, by part of a name or address. Use it to find an address before drafting.",
  inputSchema: inWorkspace(contactSearchFields),
  execute: async ({ workspaceId, mailboxId, query, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.searchContacts(ctx.userId, r.mailbox, { query, limit });
    }),
});

export const getRawEmail = createTool({
  id: "getRawEmail",
  description:
    "Fetch the raw source of an email in a specific mailbox — every header and MIME part. Use for delivery questions (Received, SPF, DKIM, DMARC, reply-to).",
  inputSchema: inWorkspace(messageTarget),
  execute: async ({ workspaceId, mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getRawEmail(r.mailbox, id);
    }),
});

export const summarizeThread = createTool({
  id: "summarizeThread",
  description:
    "Summarize a conversation in a specific mailbox into cards — decisions, action items, dates, amounts and links — the same summary the app shows. Pass the latest email's id and, when you have it, the threadId.",
  inputSchema: inWorkspace(summarizeThreadFields),
  execute: async ({ workspaceId, mailboxId, id, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.summarizeThread(ctx, r.mailbox, { id, threadId });
    }),
});
