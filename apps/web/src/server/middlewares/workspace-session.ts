import "server-only";
import { ORPCError, os } from "@orpc/server";
import type { ZodType } from "zod";

import type { AppUserSession, WorkspaceUserSession } from "@/auth/session";
import { getWorkspaceBySlug } from "@/workspace";

import type { WorkspaceScope } from "../schema";
import { appSession } from "./app-session";

const resolveWorkspace = os
  .$context<{ appUser: AppUserSession }>()
  .middleware(async ({ context, next }, input: WorkspaceScope) => {
    const membership = await getWorkspaceBySlug(context.appUser.userId, input.workspaceSlug);
    if (!membership) {
      throw new ORPCError("FORBIDDEN", { message: "Unknown workspace" });
    }
    const appUser: WorkspaceUserSession = {
      ...context.appUser,
      workspaceId: membership.id,
      workspaceSlug: membership.slug,
      workspaceRole: membership.role,
    };
    return next({ context: { appUser } });
  });

export function workspaceSession<T extends ZodType<WorkspaceScope>>(schema: T) {
  return appSession.input(schema).use(resolveWorkspace, (input: WorkspaceScope) => ({
    workspaceSlug: input.workspaceSlug,
  }));
}
