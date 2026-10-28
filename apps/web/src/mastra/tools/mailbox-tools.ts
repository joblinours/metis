import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as labels from "@/ops/labels";
import * as mail from "@/ops/mail";
import { analyzePhishing } from "@/ops/phishing";
import { phishingDetectionEnabled } from "@/services/phishing-detection";

import { getMailboxCtx } from "../runtime-context";
import { withToolErrors } from "../toolkit/resolve";
import { folderEnum } from "../toolkit/schema";

const listEmailsTool = createTool({
  id: "listEmails",
  description: "List emails from a folder in the active mailbox.",
  inputSchema: z.object({
    folder: folderEnum,
    limit: z.number().min(1).max(50).default(10),
  }),
  execute: async ({ folder, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      const { mailbox: _mailbox, ...rest } = await mail.listMessages(ctx, {
        folder,
        limit,
      });
      return rest;
    }),
});

const searchMailTool = createTool({
  id: "searchMail",
  description: "Search the active mailbox for emails matching a query.",
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      const { count, emails } = await mail.searchAcross([ctx], query);
      return {
        count,
        emails: emails.map(({ mailboxId: _id, mailbox: _mb, ...rest }) => rest),
      };
    }),
});

const getEmailTool = createTool({
  id: "getEmail",
  description:
    "Fetch the full plain-text body of an email by id. Use before summarizing or drafting a reply. If no id is supplied and there is a current email in context, pass that id.",
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      return mail.getBody(ctx, id, 6000);
    }),
});

const starEmailTool = createTool({
  id: "starEmail",
  description: "Star or unstar an email in the active mailbox.",
  inputSchema: z.object({ id: z.string(), starred: z.boolean() }),
  execute: async ({ id, starred }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      return mail.star(ctx, id, starred);
    }),
});

const setLabelTool = createTool({
  id: "setLabel",
  description:
    "Set or change the label/category on an email. The label must be one of the user's existing built-in or custom label keys — never invent keys. If no id is supplied and a current email is in context, use that id.",
  inputSchema: z.object({ id: z.string(), label: z.string() }),
  execute: async ({ id, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      return labels.setLabel({ userId: ctx.userId, mailbox: ctx, id, label });
    }),
});

const deleteEmailsTool = createTool({
  id: "deleteEmails",
  description:
    "Move the listed emails to the trash in the active mailbox. List the exact email ids.",
  inputSchema: z.object({
    ids: z.array(z.string()).min(1),
    summary: z.string().describe("Short human-readable description of what will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ ids }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      const { mailboxId: _mailboxId, ...rest } = await mail.trash(ctx, ids);
      return rest;
    }),
});

const analyzePhishingTool = createTool({
  id: "analyzePhishing",
  description:
    "Run the phishing-detection engine on an email. Returns classification (Legitimate/Suspicious/Phishing), risk score 0-100, confidence, and reasons. Use when the user asks whether an email is safe/phishing. If no id is supplied and a current email is in context, use that id.",
  inputSchema: z.object({ id: z.string() }),
  execute: async ({ id }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getMailboxCtx(requestContext);
      return analyzePhishing({
        mailbox: ctx,
        userId: ctx.userId,
        id,
        headers: ctx.headers,
      });
    }),
});

const baseMailboxTools = {
  listEmails: listEmailsTool,
  searchMail: searchMailTool,
  getEmail: getEmailTool,
  starEmail: starEmailTool,
  setLabel: setLabelTool,
  deleteEmails: deleteEmailsTool,
};

export function mailboxTools() {
  return phishingDetectionEnabled()
    ? { ...baseMailboxTools, analyzePhishing: analyzePhishingTool }
    : baseMailboxTools;
}
