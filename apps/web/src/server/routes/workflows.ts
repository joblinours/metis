import "server-only";
import { ORPCError } from "@orpc/server";

import { mailSessionFor } from "@/mail/session";
import {
  cancelWorkspaceRun,
  createUserWorkflow,
  deleteUserWorkflow,
  getWorkspaceRun,
  listWorkspaceRuns,
  listWorkspaceWorkflows,
  requestWorkflowRun,
  resumeWorkspaceRun,
  toggleUserWorkflow,
  updateUserWorkflow,
  type WorkflowSummary,
} from "@/workflow";
import { previewDecision } from "@/workflow/preview";
import { workflowScopeFor } from "@/workflow/scope";

import { workspaceSession } from "../middlewares/workspace-session";
import {
  cancelWorkflowRunInputSchema,
  cancelWorkflowRunOutputSchema,
  createWorkflowInputSchema,
  deleteWorkflowInputSchema,
  deleteWorkflowOutputSchema,
  getWorkflowRunInputSchema,
  getWorkflowRunOutputSchema,
  listWorkflowRunsInputSchema,
  listWorkflowRunsOutputSchema,
  listWorkflowsOutputSchema,
  previewDecisionInputSchema,
  previewDecisionOutputSchema,
  resumeWorkflowRunInputSchema,
  resumeWorkflowRunOutputSchema,
  runWorkflowInputSchema,
  runWorkflowOutputSchema,
  toggleWorkflowInputSchema,
  toggleWorkflowOutputSchema,
  updateWorkflowInputSchema,
  workflowOutputSchema,
  workspaceScopeSchema,
} from "../schema";

function orThrow(result: WorkflowSummary | string): WorkflowSummary {
  if (typeof result === "string") {
    throw new ORPCError("BAD_REQUEST", { message: result });
  }
  return result;
}

export const workflowsRouter = {
  list: workspaceSession(workspaceScopeSchema)
    .output(listWorkflowsOutputSchema)
    .handler(async ({ context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const workflows = await listWorkspaceWorkflows(scope);
      return { workflows, mailboxes: scope.directory };
    }),

  create: workspaceSession(createWorkflowInputSchema)
    .output(workflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const created = await createUserWorkflow(scope, input.workflow);
      return { workflow: orThrow(created) };
    }),

  update: workspaceSession(updateWorkflowInputSchema)
    .output(workflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const updated = await updateUserWorkflow(scope, input.id, input.workflow);
      return { workflow: orThrow(updated) };
    }),

  toggle: workspaceSession(toggleWorkflowInputSchema)
    .output(toggleWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const found = await toggleUserWorkflow(scope, input.id, input.enabled);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      return { success: true as const };
    }),

  delete: workspaceSession(deleteWorkflowInputSchema)
    .output(deleteWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      if (appUser.workspaceRole !== "owner" && appUser.workspaceRole !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only an admin can delete workflows",
        });
      }
      const scope = await workflowScopeFor(appUser);
      const found = await deleteUserWorkflow(scope, input.id);
      if (!found) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      return { success: true as const };
    }),

  run: workspaceSession(runWorkflowInputSchema)
    .output(runWorkflowOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const requested = await requestWorkflowRun(scope, input.id);
      if (typeof requested === "string") {
        throw new ORPCError("BAD_REQUEST", { message: requested });
      }
      return { runId: requested.runId, status: "queued" as const };
    }),

  runs: workspaceSession(listWorkflowRunsInputSchema)
    .output(listWorkflowRunsOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const runs = await listWorkspaceRuns({
        scope,
        workflowId: input.workflowId,
        limit: input.limit,
      });
      return { runs };
    }),

  getRun: workspaceSession(getWorkflowRunInputSchema)
    .output(getWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const run = await getWorkspaceRun(scope, input.runId);
      if (!run) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      return { run };
    }),

  cancelRun: workspaceSession(cancelWorkflowRunInputSchema)
    .output(cancelWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await cancelWorkspaceRun(scope, input.runId);
      if (!result) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      return result;
    }),

  previewDecision: workspaceSession(previewDecisionInputSchema)
    .output(previewDecisionOutputSchema)
    .handler(async ({ input, context }) => {
      const { appUser } = context;
      const scope = await workflowScopeFor(appUser);
      const mailbox = scope.directory.find((m) => m.mailboxId === input.mailboxId);
      if (!mailbox) {
        throw new ORPCError("NOT_FOUND", {
          message: "That mailbox is not in this workspace",
        });
      }
      const preview = await previewDecision({
        userId: appUser.userId,
        mail: await mailSessionFor(appUser, mailbox.slug),
        node: input.node,
        limit: input.limit,
      });
      if (!preview.ok) {
        throw new ORPCError("BAD_REQUEST", { message: preview.message });
      }
      return { items: preview.items };
    }),

  resumeRun: workspaceSession(resumeWorkflowRunInputSchema)
    .output(resumeWorkflowRunOutputSchema)
    .handler(async ({ input, context }) => {
      const scope = await workflowScopeFor(context.appUser);
      const result = await resumeWorkspaceRun(scope, input.runId);
      if (!result) throw new ORPCError("NOT_FOUND", { message: "Not found" });
      return result;
    }),
};
