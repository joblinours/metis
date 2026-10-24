import { z } from "zod";

export const workspaceTarget = {
  workspaceId: z
    .string()
    .describe(
      "The workspace to act in — a workspaceId from listWorkspaces. Every call runs inside that one workspace",
    ),
};

export function inWorkspace<T extends z.ZodRawShape>(shape: T) {
  return z.object({ ...workspaceTarget, ...shape });
}
