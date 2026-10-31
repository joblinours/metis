import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getAttachment as previewAttachment } from "@/ops/attachments";
import * as folders from "@/ops/folders";
import * as labels from "@/ops/labels";
import * as mail from "@/ops/mail";
import { analyzePhishing } from "@/ops/phishing";

import { actorHeaders, getWorkspaceCtx } from "../runtime-context";
import { draftAttachments } from "../toolkit/attachments";
import { LABEL_TOOL_TEXT } from "../toolkit/label-text";
import { requireMailbox, withToolErrors } from "../toolkit/resolve";
import {
  applyProviderLabelsFields,
  attachmentTarget,
  clearLabelFields,
  contactSearchFields,
  createLabelFields,
  createMailFolderFields,
  deleteMailFolderFields,
  draftFields,
  draftTarget,
  labelIdTarget,
  listEmailsFields,
  listEmailsInFolderFields,
  listLabelsFields,
  mailboxTarget,
  messageTarget,
  moveMailFolderFields,
  moveToFolderFields,
  renameLabelFields,
  renameMailFolderFields,
  setLabelFields,
  setLabelsFields,
  summarizeThreadFields,
} from "../toolkit/schema";

const listMailboxesTool = createTool({
  id: "listMailboxes",
  description:
    "List every connected mailbox in this workspace, with each mailbox's id, provider, and email address. Call this when you need a mailboxId the conversation has not already given you. Skip it when the user's message carries an inline <@mailbox:…> reference — those ids are already resolved.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
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

const aggregateInboxTool = createTool({
  id: "aggregateInbox",
  description:
    "Fetch the most recent inbox emails from EVERY connected mailbox and return them merged, each tagged with its source mailbox. Use for workspace-wide overviews like 'what needs my attention across all mailboxes'.",
  inputSchema: z.object({
    perMailbox: z.number().min(1).max(25).default(8),
  }),
  execute: async ({ perMailbox }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return mail.aggregateInbox(ctx.mailboxes, perMailbox);
    }),
});

const searchMailTool = createTool({
  id: "searchMail",
  description:
    "Search connected mailboxes for emails matching a query. Searches EVERY mailbox by default; pass mailboxId to search just one. Returns matches merged and tagged with the source mailbox.",
  inputSchema: z.object({
    query: z.string(),
    mailboxId: z.string().optional().describe("Restrict the search to this one mailbox"),
  }),
  execute: async ({ query, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (!mailboxId) return mail.searchAcross(ctx.mailboxes, query);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.searchAcross([r.mailbox], query);
    }),
});

const listEmailsTool = createTool({
  id: "listEmails",
  description:
    "List emails from a folder in ONE specific connected mailbox. Pass the returned nextPageToken back as pageToken to fetch the next page.",
  inputSchema: z.object(listEmailsFields),
  execute: async ({ mailboxId, folder, limit, pageToken }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listMessages(r.mailbox, { folder, limit, pageToken });
    }),
});

const getEmailTool = createTool({
  id: "getEmail",
  description:
    "Fetch the full plain-text body of an email in a specific mailbox. Provide the mailboxId it belongs to.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getBody(r.mailbox, id);
    }),
});

const getThreadTool = createTool({
  id: "getThread",
  description:
    "Fetch every email in a conversation thread in a specific mailbox, oldest first. Use the threadId returned by listEmails, aggregateInbox, or searchMail.",
  inputSchema: z.object({ ...mailboxTarget, threadId: z.string() }),
  execute: async ({ mailboxId, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getThread(r.mailbox, threadId);
    }),
});

const markReadTool = createTool({
  id: "markRead",
  description: "Mark one or more emails in a specific mailbox as read or unread.",
  inputSchema: z.object({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
    read: z.boolean(),
  }),
  execute: async ({ mailboxId, ids, read }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.markRead(r.mailbox, ids, read);
    }),
});

const starEmailTool = createTool({
  id: "starEmail",
  description: "Star or unstar an email in a specific mailbox.",
  inputSchema: z.object({ ...messageTarget, starred: z.boolean() }),
  execute: async ({ mailboxId, id, starred }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.star(r.mailbox, id, starred);
    }),
});

const archiveEmailTool = createTool({
  id: "archiveEmail",
  description: "Archive an email in a specific mailbox — it leaves the inbox but is not deleted.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.archive(r.mailbox, id);
    }),
});

const restoreEmailTool = createTool({
  id: "restoreEmail",
  description: "Restore an archived or trashed email in a specific mailbox back to the inbox.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.restore(r.mailbox, id);
    }),
});

const deleteEmailsTool = createTool({
  id: "deleteEmails",
  description:
    "Move the listed emails to the trash in a specific mailbox. Provide the mailboxId and the exact email ids.",
  inputSchema: z.object({
    ...mailboxTarget,
    ids: z.array(z.string()).min(1),
    summary: z
      .string()
      .describe("Short description of what will be deleted and from which mailbox"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, ids }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.trash(r.mailbox, ids);
    }),
});

const sendEmailTool = createTool({
  id: "sendEmail",
  description: "Send a new email from a specific mailbox. Provide the mailboxId to send from.",
  inputSchema: z.object({
    ...mailboxTarget,
    ...draftFields,
    summary: z.string().describe("Short description of the mail that will go out, and to whom"),
  }),
  execute: async ({ mailboxId, to, cc, bcc, subject, bodyHtml, attachments }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.send(r.mailbox, {
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        attachments: await draftAttachments(ctx, r.mailbox, attachments),
      });
    }),
  requireApproval: true,
});

const createDraftTool = createTool({
  id: "createDraft",
  description:
    "Create a draft email in a specific mailbox. The draft is saved to the provider's Drafts folder — nothing is sent. Returns the draft id for later updates.",
  inputSchema: z.object({ ...mailboxTarget, ...draftFields }),
  execute: async ({ mailboxId, to, cc, bcc, subject, bodyHtml, attachments }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.createDraft(r.mailbox, {
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        attachments: await draftAttachments(ctx, r.mailbox, attachments),
      });
    }),
});

const updateDraftTool = createTool({
  id: "updateDraft",
  description: "Replace the contents of an existing draft in a specific mailbox. Nothing is sent.",
  inputSchema: z.object({
    ...mailboxTarget,
    draftId: z.string(),
    ...draftFields,
  }),
  execute: async (
    { mailboxId, draftId, to, cc, bcc, subject, bodyHtml, attachments },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.updateDraft(r.mailbox, draftId, {
        to,
        cc,
        bcc,
        subject,
        bodyHtml,
        attachments: await draftAttachments(ctx, r.mailbox, attachments),
      });
    }),
});

const analyzePhishingTool = createTool({
  id: "analyzePhishing",
  description:
    "Run the phishing-detection engine on an email in a specific mailbox. Returns classification, risk score, confidence, and reasons.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return analyzePhishing({
        mailbox: r.mailbox,
        userId: ctx.userId,
        id,
        headers: actorHeaders(ctx),
      });
    }),
});

const listAttachmentsTool = createTool({
  id: "listAttachments",
  description:
    "List the attachments on an email in a specific mailbox — attachmentId, filename, type and size.",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.listAttachments(r.mailbox, id);
    }),
});

const getAttachmentTextTool = createTool({
  id: "getAttachmentText",
  description:
    "Read an email attachment as text: PDFs, calendar invites, contact cards, wallet passes and forwarded emails come back as extracted data, plain-text files as their text. Get the attachmentId from listAttachments.",
  inputSchema: z.object(attachmentTarget),
  execute: async ({ mailboxId, id, attachmentId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getAttachmentText(r.mailbox, id, attachmentId);
    }),
});

const getAttachmentTool = createTool({
  id: "getAttachment",
  description:
    "See an email attachment: images come back as the image itself, PDFs, Word documents (.docx), spreadsheets (.xlsx), calendar invites, contact cards, wallet passes, forwarded emails and text files as their content. Get the attachmentId from listAttachments.",
  inputSchema: z.object(attachmentTarget),
  execute: async ({ mailboxId, id, attachmentId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      const { image, ...rest } = await previewAttachment(r.mailbox, id, attachmentId);
      return image
        ? {
            ...rest,
            note: "An image. Its pixels are not available here; tell the user to open the email to see it.",
          }
        : rest;
    }),
});

const listMailFoldersTool = createTool({
  id: "listMailFolders",
  description:
    "List a mailbox's own folders and labels at the provider (Gmail labels, Zoho folders, sub-folders and tags, Outlook folders and categories), with each folderId, labelId and path. Use these ids with listEmailsInFolder, moveToFolder and applyProviderLabels; what you change there shows in the provider's own app.",
  inputSchema: z.object(mailboxTarget),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.listMailFolders(r.mailbox);
    }),
});

const listEmailsInFolderTool = createTool({
  id: "listEmailsInFolder",
  description:
    "List the emails in one of a mailbox's provider folders or labels (a folderId from listMailFolders), newest first, with each email's provider labelIds.",
  inputSchema: z.object(listEmailsInFolderFields),
  execute: async ({ mailboxId, folderId, limit, pageToken }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.listEmailsInFolder(r.mailbox, { folderId, limit, pageToken });
    }),
});

const moveToFolderTool = createTool({
  id: "moveToFolder",
  description:
    "Move an email into one of its mailbox's provider folders (a folderId from listMailFolders). On Gmail it adds that label and takes the email out of the inbox. Returns the email's id after the move, which can change.",
  inputSchema: z.object(moveToFolderFields),
  execute: async ({ mailboxId, id, folderId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.moveToFolder(r.mailbox, id, folderId);
    }),
});

const applyProviderLabelsTool = createTool({
  id: "applyProviderLabels",
  description:
    "Add and remove provider labels (Gmail labels, Zoho tags, Outlook categories; labelIds from listMailFolders) on several emails of one mailbox. An email can carry several.",
  inputSchema: z.object(applyProviderLabelsFields),
  execute: async ({ mailboxId, ids, add, remove }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.applyProviderLabels(r.mailbox, { ids, add, remove });
    }),
});

const searchContactsTool = createTool({
  id: "searchContacts",
  description:
    "Look up people this mailbox writes to and hears from, most frequent first, by part of a name or address. Use it to find an address before drafting.",
  inputSchema: z.object(contactSearchFields),
  execute: async ({ mailboxId, query, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.searchContacts(ctx.userId, r.mailbox, { query, limit });
    }),
});

const deleteDraftTool = createTool({
  id: "deleteDraft",
  description: "Delete a draft from a specific mailbox.",
  inputSchema: z.object({
    ...draftTarget,
    summary: z.string().describe("Short description of the draft being deleted and where"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, draftId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.deleteDraft(r.mailbox, draftId);
    }),
});

const getRawEmailTool = createTool({
  id: "getRawEmail",
  description:
    "Fetch the raw source of an email in a specific mailbox — every header and MIME part. Use for delivery questions (Received, SPF, DKIM, DMARC, reply-to).",
  inputSchema: z.object(messageTarget),
  execute: async ({ mailboxId, id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.getRawEmail(r.mailbox, id);
    }),
});

const summarizeThreadTool = createTool({
  id: "summarizeThread",
  description:
    "Summarize a conversation in a specific mailbox into cards — decisions, action items, dates, amounts and links — the same summary the app shows. Pass the latest email's id and, when you have it, the threadId.",
  inputSchema: z.object(summarizeThreadFields),
  execute: async ({ mailboxId, id, threadId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.summarizeThread(ctx, r.mailbox, { id, threadId });
    }),
});

function wsMailbox(requestContext: Parameters<typeof getWorkspaceCtx>[0], mailboxId: string) {
  return requireMailbox(getWorkspaceCtx(requestContext), mailboxId);
}

const listLabelsTool = createTool({
  id: "listLabels",
  description: LABEL_TOOL_TEXT.listLabels,
  inputSchema: z.object(listLabelsFields),
  execute: async ({ mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (!mailboxId) return labels.listLabels(ctx.mailboxes);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.listLabels([r.mailbox]);
    }),
});

const setLabelTool = createTool({
  id: "setLabel",
  description: LABEL_TOOL_TEXT.setLabel,
  inputSchema: z.object(setLabelFields),
  execute: async ({ mailboxId, id, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.setLabel(r.mailbox, id, labelId);
    }),
});

const setLabelsTool = createTool({
  id: "setLabels",
  description: LABEL_TOOL_TEXT.setLabels,
  inputSchema: z.object(setLabelsFields),
  execute: async ({ mailboxId, ids, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.setLabels(r.mailbox, ids, labelId);
    }),
});

const clearLabelTool = createTool({
  id: "clearLabel",
  description: LABEL_TOOL_TEXT.clearLabel,
  inputSchema: z.object(clearLabelFields),
  execute: async ({ mailboxId, id, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.clearLabel(r.mailbox, id, labelId);
    }),
});

const createLabelTool = createTool({
  id: "createLabel",
  description: LABEL_TOOL_TEXT.createLabel,
  inputSchema: z.object(createLabelFields),
  execute: async ({ mailboxId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.createLabel(r.mailbox, name);
    }),
});

const renameLabelTool = createTool({
  id: "renameLabel",
  description: LABEL_TOOL_TEXT.renameLabel,
  inputSchema: z.object(renameLabelFields),
  execute: async ({ mailboxId, labelId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.renameLabel(r.mailbox, labelId, name);
    }),
});

const deleteLabelTool = createTool({
  id: "deleteLabel",
  description: LABEL_TOOL_TEXT.deleteLabel,
  inputSchema: z.object({
    ...labelIdTarget,
    summary: z.string().describe("Short description of the label being deleted and where"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return labels.deleteLabel(r.mailbox, labelId);
    }),
});

const createMailFolderTool = createTool({
  id: "createMailFolder",
  description:
    "Create a folder (optionally inside another one) or a label in a mailbox, at the provider.",
  inputSchema: z.object(createMailFolderFields),
  execute: async ({ mailboxId, kind, name, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return folders.createMailFolder(r.mailbox, { kind, name, parentFolderId });
    }),
});

const renameMailFolderTool = createTool({
  id: "renameMailFolder",
  description: LABEL_TOOL_TEXT.renameMailFolder,
  inputSchema: z.object(renameMailFolderFields),
  execute: async ({ mailboxId, folderId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return folders.renameMailFolder(r.mailbox, folderId, name);
    }),
});

const moveMailFolderTool = createTool({
  id: "moveMailFolder",
  description: LABEL_TOOL_TEXT.moveMailFolder,
  inputSchema: z.object(moveMailFolderFields),
  execute: async ({ mailboxId, folderId, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return folders.moveMailFolder(r.mailbox, folderId, parentFolderId);
    }),
});

const deleteMailFolderTool = createTool({
  id: "deleteMailFolder",
  description: LABEL_TOOL_TEXT.deleteMailFolder,
  inputSchema: z.object({
    ...deleteMailFolderFields,
    summary: z.string().describe("Short description of the folder being deleted and what it holds"),
  }),
  requireApproval: true,
  execute: async ({ mailboxId, folderId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = wsMailbox(requestContext, mailboxId);
      if ("error" in r) return r;
      return folders.deleteMailFolder(r.mailbox, folderId);
    }),
});

export const workspaceMailTools = {
  listMailboxes: listMailboxesTool,
  aggregateInbox: aggregateInboxTool,
  searchMail: searchMailTool,
  listEmails: listEmailsTool,
  getEmail: getEmailTool,
  getThread: getThreadTool,
  markRead: markReadTool,
  starEmail: starEmailTool,
  archiveEmail: archiveEmailTool,
  restoreEmail: restoreEmailTool,
  deleteEmails: deleteEmailsTool,
  sendEmail: sendEmailTool,
  createDraft: createDraftTool,
  updateDraft: updateDraftTool,
  analyzePhishing: analyzePhishingTool,
  listLabels: listLabelsTool,
  setLabel: setLabelTool,
  clearLabel: clearLabelTool,
  listAttachments: listAttachmentsTool,
  getAttachment: getAttachmentTool,
  getAttachmentText: getAttachmentTextTool,
  createLabel: createLabelTool,
  deleteLabel: deleteLabelTool,
  setLabels: setLabelsTool,
  listMailFolders: listMailFoldersTool,
  listEmailsInFolder: listEmailsInFolderTool,
  moveToFolder: moveToFolderTool,
  applyProviderLabels: applyProviderLabelsTool,
  createMailFolder: createMailFolderTool,
  renameMailFolder: renameMailFolderTool,
  moveMailFolder: moveMailFolderTool,
  deleteMailFolder: deleteMailFolderTool,
  renameLabel: renameLabelTool,
  searchContacts: searchContactsTool,
  deleteDraft: deleteDraftTool,
  getRawEmail: getRawEmailTool,
  summarizeThread: summarizeThreadTool,
};
