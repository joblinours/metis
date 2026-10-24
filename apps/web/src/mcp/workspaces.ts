import "server-only";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { workspace, workspaceMember } from "@/db/schema";
import type { WorkspaceRole } from "@/types/workspace";
import { workspaceAllowsAi } from "@/workspace/policy";

export type McpWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
  aiAvailable: boolean;
};

export async function listMcpWorkspaces(userId: string): Promise<McpWorkspace[]> {
  const rows = await db
    .select({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      role: workspaceMember.role,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspace.id, workspaceMember.workspaceId))
    .where(eq(workspaceMember.userId, userId))
    .orderBy(asc(workspace.name));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    role: r.role,
    aiAvailable: workspaceAllowsAi(r),
  }));
}

export function visibleMcpWorkspaces(
  workspaces: McpWorkspace[],
  hiddenWorkspaceIds: readonly string[],
): McpWorkspace[] {
  const hidden = new Set(hiddenWorkspaceIds);
  return workspaces.filter((w) => w.aiAvailable && !hidden.has(w.id));
}
