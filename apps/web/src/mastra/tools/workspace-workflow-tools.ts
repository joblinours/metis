import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { decisionEnabled } from "@/config/runtime";
import * as workflow from "@/ops/workflow";
import { workflowDefinitionInputSchema } from "@/workflow/schema";

import { getWorkspaceCtx } from "../runtime-context";
import { requireMailbox, withToolErrors } from "../toolkit/resolve";
import {
  CANCEL_RUN_HINT,
  graphHint,
  previewDecisionFields,
  RESUME_RUN_HINT,
  RUN_DETAIL_HINT,
  SOURCES_HINT,
  workflowRunDetailFields,
  workflowRunFields,
  workflowInputsField,
  workflowTarget,
} from "../toolkit/schema";

function graphTools(decisionSteps: boolean) {
  const hint = graphHint(decisionSteps);
  return {
    listWorkflows: createTool({
      id: "listWorkflows",
      description: `List every workflow in this workspace, with its full node graph and the mailboxes it touches. ${SOURCES_HINT} ${hint}`,
      inputSchema: z.object({}),
      execute: async (_input, { requestContext }) =>
        withToolErrors(async () => workflow.listWorkflows(getWorkspaceCtx(requestContext))),
    }),
    createWorkflow: createTool({
      id: "createWorkflow",
      description: `Create a workspace workflow — a STANDING instruction that runs in the background. ${hint}`,
      inputSchema: z.object({
        workflow: workflowDefinitionInputSchema,
        summary: z
          .string()
          .describe(
            "Short description of the workflow: which mailboxes, what it matches, what it does",
          ),
      }),
      requireApproval: true,
      execute: async (input, { requestContext }) =>
        withToolErrors(async () =>
          workflow.createWorkflow({
            ctx: getWorkspaceCtx(requestContext),
            workflow: input.workflow,
          }),
        ),
    }),
    updateWorkflow: createTool({
      id: "updateWorkflow",
      description: `Rewrite an existing workflow. The graph fully replaces the previous one and becomes a new revision. ${hint}`,
      inputSchema: z.object({
        ...workflowTarget,
        workflow: workflowDefinitionInputSchema,
        summary: z
          .string()
          .describe("Short description of what this rewrite changes about the workflow"),
      }),
      requireApproval: true,
      execute: async (input, { requestContext }) =>
        withToolErrors(async () =>
          workflow.updateWorkflow({
            ctx: getWorkspaceCtx(requestContext),
            workflowId: input.workflowId,
            workflow: input.workflow,
          }),
        ),
    }),
  };
}

export const workspaceWorkflowGraphTools = {
  withDecisionSteps: graphTools(true),
  withoutDecisionSteps: graphTools(false),
};

const listWorkflowRunsTool = createTool({
  id: "listWorkflowRuns",
  description:
    "List recent workflow runs in this workspace — status, attempts, per-step outcomes and any error. Use to review what the automation actually did.",
  inputSchema: z.object(workflowRunFields),
  execute: async ({ workflowId, limit }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.listWorkflowRuns({
        ctx: getWorkspaceCtx(requestContext),
        workflowId,
        limit,
      }),
    ),
});

const getWorkflowRunTool = createTool({
  id: "getWorkflowRun",
  description: `Open one workflow run by the id listWorkflowRuns returned. ${RUN_DETAIL_HINT}`,
  inputSchema: z.object(workflowRunDetailFields),
  execute: async ({ runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.getWorkflowRun({
        ctx: getWorkspaceCtx(requestContext),
        runId,
      }),
    ),
});

const toggleWorkflowTool = createTool({
  id: "toggleWorkflow",
  description:
    "Enable or disable a workflow without changing it. Re-enabling resets its schedules and the baselines of triggers that watch mail, calendars and drives.",
  inputSchema: z.object({
    ...workflowTarget,
    enabled: z.boolean(),
    summary: z.string().describe("Which workflow is being turned on or off"),
  }),
  requireApproval: true,
  execute: async ({ workflowId, enabled }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.toggleWorkflow({
        ctx: getWorkspaceCtx(requestContext),
        workflowId,
        enabled,
      }),
    ),
});

const deleteWorkflowTool = createTool({
  id: "deleteWorkflow",
  description: "Delete a workflow permanently. Only workspace owners and admins may delete.",
  inputSchema: z.object({
    ...workflowTarget,
    summary: z.string().describe("Which workflow will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ workflowId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return workflow.deleteWorkflow({
        ctx,
        role: ctx.workspaceRole,
        workflowId,
      });
    }),
});

const applyWorkflowsTool = createTool({
  id: "applyWorkflows",
  description:
    "Queue a manual run of one workflow through its Run by hand trigger (or its schedule trigger when it has none). The run is durable: the workflow runner executes it on its next tick and listWorkflowRuns reports the outcome.",
  inputSchema: z.object({
    ...workflowTarget,
    ...workflowInputsField,
    summary: z.string().describe("Which workflow will be run and what it will act on"),
  }),
  requireApproval: true,
  execute: async ({ workflowId, inputs }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.applyWorkflows({
        ctx: getWorkspaceCtx(requestContext),
        workflowId,
        inputs,
      }),
    ),
});

const cancelWorkflowRunTool = createTool({
  id: "cancelWorkflowRun",
  description: `Cancel one workflow run by the id listWorkflowRuns returned. ${CANCEL_RUN_HINT}`,
  inputSchema: z.object({
    ...workflowRunDetailFields,
    summary: z.string().describe("Which workflow's run is being cancelled, and when it started"),
  }),
  requireApproval: true,
  execute: async ({ runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.cancelWorkflowRun({
        ctx: getWorkspaceCtx(requestContext),
        runId,
      }),
    ),
});

const resumeWorkflowRunTool = createTool({
  id: "resumeWorkflowRun",
  description: `Retry the failed or blocked steps of one workflow run by the id listWorkflowRuns returned. ${RESUME_RUN_HINT}`,
  inputSchema: z.object({
    ...workflowRunDetailFields,
    summary: z
      .string()
      .describe("Which workflow's run is being retried, when it ran, and which steps failed"),
  }),
  requireApproval: true,
  execute: async ({ runId }, { requestContext }) =>
    withToolErrors(async () =>
      workflow.resumeWorkflowRun({
        ctx: getWorkspaceCtx(requestContext),
        runId,
      }),
    ),
});

const previewDecisionTool = createTool({
  id: "previewDecision",
  description:
    "Try an ai.ask step on the latest inbox mail of one mailbox and see how each question would be answered, before saving it in a workflow. Nothing is saved or changed. The mailbox must have AI on.",
  inputSchema: z.object(previewDecisionFields),
  execute: async ({ mailboxId, node, limit }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireMailbox(ctx, mailboxId);
      if ("error" in r) return r;
      return workflow.previewDecision({ ctx, mailbox: r.mailbox, node, limit });
    }),
});

const listWorkflowStepsTool = createTool({
  id: "listWorkflowSteps",
  description:
    "List the workflow triggers and steps: each step's key, settings (with their kinds, types and defaults), outputs, effect and what it passes on. Read it before building or changing a workflow graph.",
  inputSchema: z.object({
    category: z
      .string()
      .optional()
      .describe("Only one category, such as mail, calendar, drive, logic, flow or ai"),
  }),
  execute: async ({ category }) =>
    withToolErrors(async () =>
      workflow.listWorkflowSteps({ category, decisionSteps: decisionEnabled("workflowNode") }),
    ),
});

const { listWorkflows, createWorkflow, updateWorkflow } =
  workspaceWorkflowGraphTools.withDecisionSteps;

export const workspaceWorkflowTools = {
  listWorkflows,
  listWorkflowRuns: listWorkflowRunsTool,
  getWorkflowRun: getWorkflowRunTool,
  createWorkflow,
  updateWorkflow,
  toggleWorkflow: toggleWorkflowTool,
  deleteWorkflow: deleteWorkflowTool,
  applyWorkflows: applyWorkflowsTool,
  cancelWorkflowRun: cancelWorkflowRunTool,
  resumeWorkflowRun: resumeWorkflowRunTool,
  listWorkflowSteps: listWorkflowStepsTool,
  previewDecision: previewDecisionTool,
};
