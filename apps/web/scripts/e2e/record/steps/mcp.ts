import { MCP_CALLS } from "@metis/e2e/lib/llm-scenarios";

import { getWorkspaceCtx, workspaceRequestContext } from "../../../../src/mastra/runtime-context";
import { summarizeThread } from "../../../../src/mastra/toolkit/mail";
import { previewDecision } from "../../../../src/mastra/toolkit/workflow";
import { listWorkspaceWorkflows } from "../../../../src/workflow";
import type { WorkflowNode } from "../../../../src/workflow/schema";
import { workspaceScope } from "../../workspace-scope";
import { findEmail, loadWorld, type StepContext } from "./context";

function failOnToolError(result: unknown): void {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(String(result.error));
  }
}

export async function run(ctx: StepContext): Promise<void> {
  const { appUser, headers } = ctx.session;
  const context = await workspaceRequestContext(
    {
      userId: appUser.userId,
      workspaceId: appUser.workspaceId,
      workspaceRole: appUser.workspaceRole,
    },
    headers,
  );
  if (!context) throw new Error("AI is turned off for the workspace");
  const workspace = getWorkspaceCtx(context);
  const [mailbox] = workspace.mailboxes;
  if (!mailbox) throw new Error("the workspace has no mailbox");

  if (ctx.scenario.arg === "summarizeThread") {
    const email = findEmail(await loadWorld(ctx), MCP_CALLS.summarySubject);
    failOnToolError(
      await summarizeThread(workspace, mailbox, {
        id: email.id,
        threadId: email.threadId,
      }),
    );
    console.log("[record] mcp summarizeThread ok");
    return;
  }

  if (ctx.scenario.arg === "previewDecision") {
    const scope = await workspaceScope(appUser.userId, appUser.workspaceId);
    const workflow = (await listWorkspaceWorkflows(scope)).find(
      (w) => w.name === MCP_CALLS.previewWorkflow,
    );
    const ask = workflow?.graph.nodes.find(
      (node): node is Extract<WorkflowNode, { kind: "decision.ask" }> =>
        node.kind === "decision.ask",
    );
    if (!ask) throw new Error(`"${MCP_CALLS.previewWorkflow}" has no Ask step`);
    failOnToolError(
      await previewDecision({
        ctx: workspace,
        mailbox,
        node: ask,
        limit: MCP_CALLS.previewLimit,
      }),
    );
    console.log("[record] mcp previewDecision ok");
    return;
  }

  throw new Error(`unknown MCP call ${ctx.scenario.arg}`);
}
