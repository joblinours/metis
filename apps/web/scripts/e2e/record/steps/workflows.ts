import { LATE_ARRIVAL_WORKFLOW } from "@metis/e2e/lib/late-arrival";

import { mailSessionFor } from "../../../../src/mail/session";
import { listWorkspaceWorkflows, requestWorkflowRun } from "../../../../src/workflow";
import { previewDecision } from "../../../../src/workflow/preview";
import { runNow } from "../../../../src/workflow/tick";
import { workspaceScope } from "../../workspace-scope";
import { Failures, type StepContext } from "./context";

const PREVIEW_LIMIT = 10;

export async function run(ctx: StepContext): Promise<void> {
  const { appUser, enrollment } = ctx.session;
  const scope = await workspaceScope(appUser.userId, appUser.workspaceId);
  const failures = new Failures();

  for (const workflow of await listWorkspaceWorkflows(scope)) {
    if (workflow.name === LATE_ARRIVAL_WORKFLOW) continue;
    for (const ask of workflow.graph.nodes.filter((node) => node.step === "ai.ask")) {
      await failures.attempt(`preview of "${workflow.name}"`, async () => {
        const preview = await previewDecision({
          userId: appUser.userId,
          mail: await mailSessionFor(appUser, enrollment.mailboxSlug),
          node: ask,
          limit: PREVIEW_LIMIT,
        });
        if (!preview.ok) throw new Error(preview.message);
        console.log(`[record] preview of "${workflow.name}" ok`);
      });
    }

    await failures.attempt(`run of "${workflow.name}"`, async () => {
      const requested = await requestWorkflowRun(scope, workflow.id);
      if (typeof requested === "string") {
        console.log(`[record] "${workflow.name}" not run: ${requested}`);
        return;
      }
      const status = await runNow(requested.runId);
      console.log(`[record] "${workflow.name}" run ${status}`);
    });
  }
  failures.throwIfAny();
}
