import type { WorkspaceScope } from "../../src/workflow";
import { workflowScopeFor } from "../../src/workflow/scope";

export async function workspaceScope(userId: string, workspaceId: string): Promise<WorkspaceScope> {
  return workflowScopeFor({ userId, workspaceId, workspaceRole: "owner" });
}
