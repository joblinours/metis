import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  attachmentPreviewTarget,
  attachmentTarget,
  contactSearchFields,
  messageTarget,
  summarizeThreadFields,
} from "@/mastra/toolkit/schema";
import { getAttachment as previewAttachment, getAttachmentOutput } from "@/ops/attachments";
import * as mail from "@/ops/mail";

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

const previewOutput = getAttachmentOutput.omit({ images: true }).loose();

const previewContent = z.array(
  z.union([
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("image"), data: z.string(), mimeType: z.string() }),
  ]),
);

const previewSchema = previewOutput.extend({
  structuredContent: previewOutput.optional(),
  content: previewContent.optional(),
});

export const getAttachment = createTool({
  id: "getAttachment",
  description:
    "See an email attachment: images come back as the image itself; PDFs page by page, as text, with scanned pages as images (a few pages per call: pass nextPage as fromPage to read on); Word documents (.docx), spreadsheets (.xlsx), calendar invites, contact cards, wallet passes, forwarded emails and text files as their content. Get the attachmentId from listAttachments; it stays valid between calls.",
  inputSchema: inWorkspace(attachmentPreviewTarget),
  outputSchema: previewSchema,
  execute: async ({ workspaceId, mailboxId, id, attachmentId, fromPage }, { requestContext }) => {
    const result = await withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return previewAttachment(r.mailbox, id, attachmentId, fromPage);
    });
    const { images, ...structured } =
      "images" in result ? result : { ...result, images: undefined };
    const parsed = previewOutput.safeParse(structured);
    const structuredContent = parsed.success
      ? parsed.data
      : { error: "Could not read that attachment" };
    const header = [structuredContent.filename, structuredContent.mimeType, structuredContent.kind]
      .filter(Boolean)
      .join(" · ");
    const content: z.infer<typeof previewContent> = [
      {
        type: "text",
        text: structuredContent.error
          ? `${header ? `${header}: ` : ""}${structuredContent.error}`
          : structuredContent.text !== undefined
            ? `${header}\n\n${structuredContent.text}`
            : header,
      },
    ];
    for (const image of images ?? []) {
      content.push({ type: "image", data: image.data, mimeType: image.mimeType });
    }
    return { structuredContent, content };
  },
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
