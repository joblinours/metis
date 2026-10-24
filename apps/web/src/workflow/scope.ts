import "server-only";
import { listWorkspaceMailboxes } from "@/connections";

import type { WorkspaceScope } from "./index";

export interface WorkflowScopeUser {
  userId: string;
  workspaceId: string;
}

export async function workflowScopeFor(appUser: WorkflowScopeUser): Promise<
  WorkspaceScope & {
    directory: { mailboxId: string; slug: string; email: string }[];
  }
> {
  const boxes = await listWorkspaceMailboxes(appUser.workspaceId);
  return {
    workspaceId: appUser.workspaceId,
    userId: appUser.userId,
    mailboxes: boxes.map((m) => ({
      mailboxId: m.id,
      linkId: m.linkId,
      email: m.email,
      aiEnabled: m.policy.ai,
    })),
    directory: boxes.map((m) => ({
      mailboxId: m.id,
      slug: m.slug,
      email: m.email,
    })),
  };
}
