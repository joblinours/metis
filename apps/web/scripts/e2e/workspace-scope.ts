import { listWorkspaceMailboxes } from "../../src/connections";
import type { WorkspaceScope } from "../../src/workflow";

export async function workspaceScope(userId: string, workspaceId: string): Promise<WorkspaceScope> {
  const boxes = await listWorkspaceMailboxes(workspaceId);
  return {
    workspaceId,
    userId,
    mailboxes: boxes.map((box) => ({
      mailboxId: box.id,
      linkId: box.linkId,
      email: box.email,
      aiEnabled: box.policy.ai,
    })),
  };
}
