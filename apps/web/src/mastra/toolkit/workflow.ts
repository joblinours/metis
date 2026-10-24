import "server-only";
import type { WorkspaceRole } from "@/types/workspace";
import {
  cancelWorkspaceRun,
  createUserWorkflow,
  deleteUserWorkflow,
  getWorkspaceRun,
  getWorkspaceWorkflow,
  listWorkspaceRuns,
  listWorkspaceWorkflows,
  requestWorkflowRun,
  resumeWorkspaceRun,
  toggleUserWorkflow,
  updateUserWorkflow,
  type WorkspaceScope,
} from "@/workflow";
import { previewDecision as previewAsk } from "@/workflow/preview";
import type { WorkflowNode } from "@/workflow/schema";

import { type AgentMailbox, mailScopeFor, type WorkspaceCtx } from "../runtime-context";

export function workspaceScope(ctx: WorkspaceCtx): WorkspaceScope {
  return {
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      linkId: m.linkId,
      email: m.email,
      aiEnabled: true,
    })),
  };
}

export async function listWorkflows(ctx: WorkspaceCtx) {
  const workflows = await listWorkspaceWorkflows(workspaceScope(ctx));
  return {
    workflows,
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      email: m.email,
    })),
  };
}

export async function listWorkflowRuns(args: {
  ctx: WorkspaceCtx;
  workflowId?: string;
  limit: number;
}) {
  const runs = await listWorkspaceRuns({
    scope: workspaceScope(args.ctx),
    workflowId: args.workflowId,
    limit: args.limit,
  });
  return { runs };
}

export async function getWorkflowRun(args: { ctx: WorkspaceCtx; runId: string }) {
  const run = await getWorkspaceRun(workspaceScope(args.ctx), args.runId);
  if (!run) return { error: `No workflow run "${args.runId}" in this workspace` };
  return { run };
}

export async function cancelWorkflowRun(args: { ctx: WorkspaceCtx; runId: string }) {
  const result = await cancelWorkspaceRun(workspaceScope(args.ctx), args.runId);
  if (!result) {
    return { error: `No workflow run "${args.runId}" in this workspace` };
  }
  return { runId: args.runId, ...result };
}

export async function resumeWorkflowRun(args: { ctx: WorkspaceCtx; runId: string }) {
  const result = await resumeWorkspaceRun(workspaceScope(args.ctx), args.runId);
  if (!result) {
    return { error: `No workflow run "${args.runId}" in this workspace` };
  }
  return { runId: args.runId, ...result };
}

export async function createWorkflow(args: { ctx: WorkspaceCtx; workflow: unknown }) {
  const created = await createUserWorkflow(workspaceScope(args.ctx), args.workflow);
  if (typeof created === "string") return { error: created };
  return { workflow: created };
}

export async function updateWorkflow(args: {
  ctx: WorkspaceCtx;
  workflowId: string;
  workflow: unknown;
}) {
  const updated = await updateUserWorkflow(
    workspaceScope(args.ctx),
    args.workflowId,
    args.workflow,
  );
  if (typeof updated === "string") return { error: updated };
  return { workflow: updated };
}

export async function toggleWorkflow(args: {
  ctx: WorkspaceCtx;
  workflowId: string;
  enabled: boolean;
}) {
  const found = await toggleUserWorkflow(workspaceScope(args.ctx), args.workflowId, args.enabled);
  if (!found) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  return { success: true, workflowId: args.workflowId, enabled: args.enabled };
}

export async function deleteWorkflow(args: {
  ctx: WorkspaceCtx;
  role: WorkspaceRole | null;
  workflowId: string;
}) {
  if (args.role !== "owner" && args.role !== "admin") {
    return { error: "Only a workspace owner or admin can delete workflows" };
  }
  const found = await deleteUserWorkflow(workspaceScope(args.ctx), args.workflowId);
  if (!found) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  return { success: true, workflowId: args.workflowId };
}

export async function applyWorkflows(args: { ctx: WorkspaceCtx; workflowId: string }) {
  const existing = await getWorkspaceWorkflow(workspaceScope(args.ctx), args.workflowId);
  if (!existing) {
    return { error: `No workflow "${args.workflowId}" in this workspace` };
  }
  const requested = await requestWorkflowRun(workspaceScope(args.ctx), args.workflowId);
  if (typeof requested === "string") return { error: requested };
  return {
    queued: true,
    runId: requested.runId,
    note: "The workflow runner picks this up on its next tick; check listWorkflowRuns for the outcome.",
  };
}

export async function previewDecision(args: {
  ctx: WorkspaceCtx;
  mailbox: AgentMailbox;
  node: Extract<WorkflowNode, { kind: "decision.ask" }>;
  limit: number;
}) {
  const preview = await previewAsk({
    userId: args.ctx.userId,
    mail: mailScopeFor(args.ctx, args.mailbox),
    node: args.node,
    limit: args.limit,
  });
  if (!preview.ok) return { error: preview.message };
  return {
    mailboxId: args.mailbox.mailboxId,
    count: preview.items.length,
    items: preview.items,
    note: "A preview only: nothing was saved, labelled or moved.",
  };
}
