import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { draftAttachments } from "@/mastra/toolkit/attachments";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import { draftFields, draftTarget, mailboxTarget } from "@/mastra/toolkit/schema";
import * as mail from "@/ops/mail";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const createDraft = createTool({
  id: "createDraft",
  description:
    "Create a draft email in a specific mailbox. The draft is saved to the provider's Drafts folder — nothing is sent. Returns the draft id for later updates.",
  inputSchema: inWorkspace({ ...mailboxTarget, ...draftFields }),
  execute: async (
    { workspaceId, mailboxId, to, cc, bcc, subject, bodyHtml, attachments },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
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

export const updateDraft = createTool({
  id: "updateDraft",
  description: "Replace the contents of an existing draft in a specific mailbox. Nothing is sent.",
  inputSchema: inWorkspace({
    ...mailboxTarget,
    draftId: z.string(),
    ...draftFields,
  }),
  execute: async (
    { workspaceId, mailboxId, draftId, to, cc, bcc, subject, bodyHtml, attachments },
    { requestContext },
  ) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
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

export const deleteDraft = createTool({
  id: "deleteDraft",
  description: "Delete a draft from a specific mailbox.",
  inputSchema: inWorkspace(draftTarget),
  execute: async ({ workspaceId, mailboxId, draftId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return mail.deleteDraft(r.mailbox, draftId);
    }),
});
