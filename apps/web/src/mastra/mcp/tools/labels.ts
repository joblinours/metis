import "server-only";
import { createTool } from "@mastra/core/tools";

import { LABEL_TOOL_TEXT } from "@/mastra/toolkit/label-text";
import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  clearLabelFields,
  createLabelFields,
  labelIdTarget,
  listLabelsFields,
  renameLabelFields,
  setLabelFields,
  setLabelsFields,
} from "@/mastra/toolkit/schema";
import * as labels from "@/ops/labels";

import { mcpScopeFromCall } from "../context";
import { inWorkspace } from "../schema";

export const listLabels = createTool({
  id: "listLabels",
  description: LABEL_TOOL_TEXT.listLabels,
  inputSchema: inWorkspace(listLabelsFields),
  execute: async ({ workspaceId, mailboxId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      if (!mailboxId) return labels.listLabels(ctx.mailboxes);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.listLabels([r.mailbox]);
    }),
});

export const setLabel = createTool({
  id: "setLabel",
  description: LABEL_TOOL_TEXT.setLabel,
  inputSchema: inWorkspace(setLabelFields),
  execute: async ({ workspaceId, mailboxId, id, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.setLabel(r.mailbox, id, labelId);
    }),
});

export const setLabels = createTool({
  id: "setLabels",
  description: LABEL_TOOL_TEXT.setLabels,
  inputSchema: inWorkspace(setLabelsFields),
  execute: async ({ workspaceId, mailboxId, ids, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.setLabels(r.mailbox, ids, labelId);
    }),
});

export const clearLabel = createTool({
  id: "clearLabel",
  description: LABEL_TOOL_TEXT.clearLabel,
  inputSchema: inWorkspace(clearLabelFields),
  execute: async ({ workspaceId, mailboxId, id, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.clearLabel(r.mailbox, id, labelId);
    }),
});

export const createLabel = createTool({
  id: "createLabel",
  description: LABEL_TOOL_TEXT.createLabel,
  inputSchema: inWorkspace(createLabelFields),
  execute: async ({ workspaceId, mailboxId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.createLabel(r.mailbox, name);
    }),
});

export const renameLabel = createTool({
  id: "renameLabel",
  description: LABEL_TOOL_TEXT.renameLabel,
  inputSchema: inWorkspace(renameLabelFields),
  execute: async ({ workspaceId, mailboxId, labelId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.renameLabel(r.mailbox, labelId, name);
    }),
});

export const deleteLabel = createTool({
  id: "deleteLabel",
  description: LABEL_TOOL_TEXT.deleteLabel,
  inputSchema: inWorkspace(labelIdTarget),
  execute: async ({ workspaceId, mailboxId, labelId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return labels.deleteLabel(r.mailbox, labelId);
    }),
});
