import "server-only";
import type { AuditActor } from "@/audit";
import type { ThemeBrandId } from "@/theme/brand";
import {
  setWorkspaceTheme as changeTheme,
  listWorkspaceInvites,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
} from "@/workspace/admin";

import type { WorkspaceCtx, WorkspaceMember } from "../runtime-context";

function actor(ctx: WorkspaceCtx) {
  return { workspaceId: ctx.workspaceId, actorRole: ctx.workspaceRole };
}

function auditedBy(ctx: WorkspaceCtx): AuditActor {
  return ctx.actor.kind === "mcp"
    ? { userId: ctx.userId, via: "mcp", mcpClientId: ctx.actor.clientId }
    : { userId: ctx.userId, via: "assistant", headers: ctx.actor.headers };
}

export async function listInvites(ctx: WorkspaceCtx) {
  const invites = await listWorkspaceInvites(actor(ctx));
  if ("error" in invites) return { error: invites.error };
  return {
    count: invites.length,
    invites: invites.map((i) => ({
      inviteId: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

export async function removeMember(ctx: WorkspaceCtx, member: WorkspaceMember) {
  const result = await removeWorkspaceMember({
    ...actor(ctx),
    memberId: member.memberId,
    by: auditedBy(ctx),
  });
  if ("error" in result) return { error: result.error };
  return {
    removed: true,
    memberId: member.userId,
    email: member.email,
    note: "Their mailboxes, calendars and drives were detached from this workspace.",
  };
}

export async function revokeInvite(ctx: WorkspaceCtx, inviteId: string) {
  const result = await revokeWorkspaceInvite({
    ...actor(ctx),
    inviteId,
    by: auditedBy(ctx),
  });
  if ("error" in result) return { error: result.error };
  return { revoked: true, inviteId };
}

export async function setWorkspaceTheme(ctx: WorkspaceCtx, themeBrand: ThemeBrandId) {
  const result = await changeTheme({ ...actor(ctx), themeBrand });
  if ("error" in result) return { error: result.error };
  return { updated: true, themeBrand };
}
