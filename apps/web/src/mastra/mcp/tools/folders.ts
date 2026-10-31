import "server-only";
import { createTool } from "@mastra/core/tools";

import { LABEL_TOOL_TEXT } from "@/mastra/toolkit/label-text";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  applyProviderLabelsFields,
  createMailFolderFields,
  deleteMailFolderFields,
  listEmailsInFolderFields,
  mailboxTarget,
  moveMailFolderFields,
  moveToFolderFields,
  renameMailFolderFields,
} from "@/mastra/toolkit/schema";
import * as folders from "@/ops/folders";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const listMailFolders = createTool({
  id: "listMailFolders",
  description:
    "List a mailbox's own folders and labels at the provider (Gmail labels, Zoho folders, sub-folders and tags, Outlook folders and categories), with each folderId, labelId and path. Use these ids with listEmailsInFolder, moveToFolder and applyProviderLabels; what you change there shows in the provider's own app.",
  inputSchema: inWorkspace(mailboxTarget),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.listMailFolders(r.mailbox);
    }),
});

export const listEmailsInFolder = createTool({
  id: "listEmailsInFolder",
  description:
    "List the emails in one of a mailbox's provider folders or labels (a folderId from listMailFolders), newest first, with each email's provider labelIds.",
  inputSchema: inWorkspace(listEmailsInFolderFields),
  execute: async ({ workspaceId, mailboxId, folderId, limit, pageToken }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.listEmailsInFolder(r.mailbox, { folderId, limit, pageToken });
    }),
});

export const moveToFolder = createTool({
  id: "moveToFolder",
  description:
    "Move an email into one of its mailbox's provider folders (a folderId from listMailFolders). On Gmail it adds that label and takes the email out of the inbox. Returns the email's id after the move, which can change.",
  inputSchema: inWorkspace(moveToFolderFields),
  execute: async ({ workspaceId, mailboxId, id, folderId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.moveToFolder(r.mailbox, id, folderId);
    }),
});

export const applyProviderLabels = createTool({
  id: "applyProviderLabels",
  description:
    "Add and remove provider labels (Gmail labels, Zoho tags, Outlook categories; labelIds from listMailFolders) on several emails of one mailbox. An email can carry several.",
  inputSchema: inWorkspace(applyProviderLabelsFields),
  execute: async ({ workspaceId, mailboxId, ids, add, remove }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.applyProviderLabels(r.mailbox, { ids, add, remove });
    }),
});

export const createMailFolder = createTool({
  id: "createMailFolder",
  description:
    "Create a folder (optionally inside another one) or a label in a mailbox, at the provider.",
  inputSchema: inWorkspace(createMailFolderFields),
  execute: async ({ workspaceId, mailboxId, kind, name, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.createMailFolder(r.mailbox, { kind, name, parentFolderId });
    }),
});

export const renameMailFolder = createTool({
  id: "renameMailFolder",
  description: LABEL_TOOL_TEXT.renameMailFolder,
  inputSchema: inWorkspace(renameMailFolderFields),
  execute: async ({ workspaceId, mailboxId, folderId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.renameMailFolder(r.mailbox, folderId, name);
    }),
});

export const moveMailFolder = createTool({
  id: "moveMailFolder",
  description: LABEL_TOOL_TEXT.moveMailFolder,
  inputSchema: inWorkspace(moveMailFolderFields),
  execute: async ({ workspaceId, mailboxId, folderId, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.moveMailFolder(r.mailbox, folderId, parentFolderId);
    }),
});

export const deleteMailFolder = createTool({
  id: "deleteMailFolder",
  description: LABEL_TOOL_TEXT.deleteMailFolder,
  inputSchema: inWorkspace(deleteMailFolderFields),
  execute: async ({ workspaceId, mailboxId, folderId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return folders.deleteMailFolder(r.mailbox, folderId);
    }),
});
