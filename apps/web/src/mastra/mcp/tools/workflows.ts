import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireMailbox, withToolErrors } from "@/mastra/toolkit/resolve";
import {
  CANCEL_RUN_HINT,
  graphHint,
  previewDecisionFields,
  RESUME_RUN_HINT,
  RUN_DETAIL_HINT,
  SOURCES_HINT,
  workflowRunDetailFields,
  workflowRunFields,
  workflowTarget,
} from "@/mastra/toolkit/schema";
import * as workflow from "@/mastra/toolkit/workflow";
import { workflowDefinitionInputSchema } from "@/workflow/schema";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

function graphTools(decisionSteps: boolean) {
  const hint = graphHint(decisionSteps);
  return {
    listWorkflows: createTool({
      id: "listWorkflows",
      description: `List every workflow in one workspace, with its full node graph and the mailboxes it touches. ${SOURCES_HINT} ${hint}`,
      inputSchema: z.object(workspaceTarget),
      execute: async ({ workspaceId }, { requestContext }) =>
        withToolErrors(async () =>
          workflow.listWorkflows(await mcpScopeFromCall(requestContext, workspaceId)),
        ),
    }),
    createWorkflow: createTool({
      id: "createWorkflow",
      description: `Create a workflow in one workspace. A workflow is a STANDING instruction that runs in the background — confirm the exact graph with the user before creating. ${hint}`,
      inputSchema: inWorkspace({ workflow: workflowDefinitionInputSchema }),
      execute: async (input, { requestContext }) =>
        withToolErrors(async () =>
          workflow.createWorkflow({
            ctx: await mcpScopeFromCall(requestContext, input.workspaceId),
            workflow: input.workflow,
          }),
        ),
    }),
    updateWorkflow: createTool({
      id: "updateWorkflow",
      description: `Rewrite an existing workflow. The graph fully replaces the previous one and becomes a new revision. ${hint}`,
      inputSchema: inWorkspace({
        ...workflowTarget,
        workflow: workflowDefinitionInputSchema,
      }),
      execute: async (input, { requestContext }) =>
        withToolErrors(async () =>
          workflow.updateWorkflow({
            ctx: await mcpScopeFromCall(requestContext, input.workspaceId),
            workflowId: input.workflowId,
            workflow: input.workflow,
          }),
        ),
    }),
  };
}

export const workflowGraphTools = {
  withDecisionSteps: graphTools(true),
  withoutDecisionSteps: graphTools(false),
};

export const listWorkflowRuns = createTool({
  id: "listWorkflowRuns",
  description:
    "List recent workflow runs in one workspace — status, attempts, per-step outcomes and any error.",
  inputSchema: inWorkspace(workflowRunFields),
  execute: async ({ workspaceId, workflowId, limit }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.listWorkflowRuns({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        workflowId,
        limit,
      }),
    ),
});

export const getWorkflowRun = createTool({
  id: "getWorkflowRun",
  description: `Open one workflow run by the id listWorkflowRuns returned. ${RUN_DETAIL_HINT}`,
  inputSchema: inWorkspace(workflowRunDetailFields),
  execute: async ({ workspaceId, runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.getWorkflowRun({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        runId,
      }),
    ),
});

export const toggleWorkflow = createTool({
  id: "toggleWorkflow",
  description:
    "Enable or disable a workflow without changing it. Re-enabling resets its schedule and new-mail baseline.",
  inputSchema: inWorkspace({ ...workflowTarget, enabled: z.boolean() }),
  execute: async ({ workspaceId, workflowId, enabled }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.toggleWorkflow({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        workflowId,
        enabled,
      }),
    ),
});

export const deleteWorkflow = createTool({
  id: "deleteWorkflow",
  description: "Delete a workflow permanently. Only workspace owners and admins may delete.",
  inputSchema: inWorkspace(workflowTarget),
  execute: async ({ workspaceId, workflowId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return workflow.deleteWorkflow({
        ctx,
        role: ctx.workspaceRole,
        workflowId,
      });
    }),
});

export const applyWorkflows = createTool({
  id: "applyWorkflows",
  description:
    "Queue a manual run of one workflow. The run is durable: the workflow runner executes it on its next tick and listWorkflowRuns reports the outcome.",
  inputSchema: inWorkspace(workflowTarget),
  execute: async ({ workspaceId, workflowId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.applyWorkflows({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        workflowId,
      }),
    ),
});

export const previewDecision = createTool({
  id: "previewDecision",
  description:
    "Try a decision.ask step on the latest inbox mail of one mailbox and see how each question would be answered, before saving it in a workflow. Nothing is saved or changed. The mailbox must have AI on.",
  inputSchema: inWorkspace(previewDecisionFields),
  execute: async ({ workspaceId, mailboxId, node, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return workflow.previewDecision({ ctx, mailbox: r.mailbox, node, limit });
    }),
});

export const cancelWorkflowRun = createTool({
  id: "cancelWorkflowRun",
  description: `Cancel one workflow run by the id listWorkflowRuns returned. ${CANCEL_RUN_HINT}`,
  inputSchema: inWorkspace(workflowRunDetailFields),
  execute: async ({ workspaceId, runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.cancelWorkflowRun({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        runId,
      }),
    ),
});

export const resumeWorkflowRun = createTool({
  id: "resumeWorkflowRun",
  description: `Retry the failed or blocked steps of one workflow run by the id listWorkflowRuns returned. ${RESUME_RUN_HINT}`,
  inputSchema: inWorkspace(workflowRunDetailFields),
  execute: async ({ workspaceId, runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.resumeWorkflowRun({
        ctx: await mcpScopeFromCall(requestContext, workspaceId),
        runId,
      }),
    ),
});
