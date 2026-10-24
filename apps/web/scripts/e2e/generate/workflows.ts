import { createUserWorkflow } from "../../../src/workflow";
import { scheduleSend } from "../../../src/workflow/builtins/scheduled-send";
import { workspaceScope } from "../workspace-scope";
import type { Account } from "./account";
import { seededWorkflows } from "./workflow-graphs";

export async function seedWorkflows(account: Account): Promise<void> {
  const scope = await workspaceScope(account.userId, account.workspaceId);
  const [box] = scope.mailboxes;
  if (!box) throw new Error("the seeded mailbox is not in the workspace");

  for (const workflow of seededWorkflows(box.mailboxId)) {
    const created = await createUserWorkflow(scope, workflow);
    if (typeof created === "string") {
      throw new Error(`workflow "${workflow.name}": ${created}`);
    }
  }

  await scheduleSend({
    userId: account.userId,
    workspaceId: account.workspaceId,
    mailboxId: box.mailboxId,
    linkId: box.linkId,
    payload: {
      to: [account.email],
      subject: "Moodboard for the rebrand",
      bodyHtml: "<p>The moodboard is in the Rebrand folder.</p>",
      bodyText: "The moodboard is in the Rebrand folder.",
    },
    at: new Date("2099-01-05T09:00:00Z"),
  });
  console.log(
    `[generate] seeded ${seededWorkflows(box.mailboxId).length} workflows and a scheduled send`,
  );
}
