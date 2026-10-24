import "server-only";
import type { AuditActor } from "@/audit";
import {
  listSignupInvites as listInvites,
  revokeSignupInvite as revokeInvite,
  sendSignupInvite,
} from "@/auth/signup";
import {
  attachOwnedCalendar,
  attachOwnedDrive,
  attachOwnedMailbox,
  type ConnectionResource,
  listAccountCalendars,
  listAccountDrives,
  listAccountMailboxes,
  listUnavailableConnections,
} from "@/connections";
import type { McpWorkspace } from "@/mcp/workspaces";
import { createWorkspace as createOwnedWorkspace } from "@/workspace";

import type { WorkspaceCtx } from "../runtime-context";
import { listDrives } from "./drive";
import { listMembers } from "./member";

export interface AccountCtx {
  userId: string;
  userName: string;
  isOwner: boolean;
  clientId: string;
  hiddenWorkspaceIds: string[];
}

function mcpActor(account: AccountCtx): AuditActor {
  return { userId: account.userId, via: "mcp", mcpClientId: account.clientId };
}

export function listWorkspaces(visible: McpWorkspace[]) {
  return {
    count: visible.length,
    workspaces: visible.map((w) => ({
      workspaceId: w.id,
      slug: w.slug,
      name: w.name,
      role: w.role,
    })),
  };
}

export async function getWorkspace(workspace: McpWorkspace, ctx: WorkspaceCtx) {
  const members = await listMembers(ctx);
  return {
    workspaceId: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    role: workspace.role,
    mailboxes: ctx.mailboxes.map((m) => ({
      mailboxId: m.mailboxId,
      provider: m.provider,
      email: m.email,
    })),
    calendarAccounts: ctx.calendars.map((c) => ({
      calendarAccountId: c.accountId,
      email: c.accountEmail,
      provider: c.provider,
    })),
    drives: listDrives(ctx.drives).drives,
    members: members.members,
  };
}

type AccountResource = {
  provider: string;
  email: string;
  workspaces: { name: string; workspaceSlug: string; aiEnabled: boolean }[];
};

function reachableResources<T extends AccountResource>(
  resources: T[],
  visible: McpWorkspace[],
  idOf: (resource: T) => string,
) {
  const slugs = new Set(visible.map((w) => w.slug));
  return resources.flatMap((resource) => {
    const links = resource.workspaces.filter((w) => slugs.has(w.workspaceSlug));
    if (resource.workspaces.length > 0 && links.length === 0) return [];
    return [
      {
        resourceId: idOf(resource),
        provider: resource.provider,
        email: resource.email,
        workspaces: links.map((w) => ({
          workspace: w.name,
          workspaceSlug: w.workspaceSlug,
          aiEnabled: w.aiEnabled,
        })),
      },
    ];
  });
}

export async function listAccountResources(account: AccountCtx, visible: McpWorkspace[]) {
  const [mailboxes, calendars, drives] = await Promise.all([
    listAccountMailboxes(account.userId),
    listAccountCalendars(account.userId),
    listAccountDrives(account.userId),
  ]);
  return {
    mailboxes: reachableResources(mailboxes, visible, (m) => m.mailboxId),
    calendars: reachableResources(calendars, visible, (c) => c.calendarId),
    drives: reachableResources(drives, visible, (d) => d.driveId),
  };
}

export async function listUnavailableAccounts(account: AccountCtx) {
  const rows = (await listUnavailableConnections(account.userId)).filter((r) => r.mine);
  return {
    count: rows.length,
    accounts: rows.map((r) => ({
      provider: r.provider,
      email: r.email,
      unavailableSince: r.quarantinedAt.toISOString(),
    })),
    note:
      rows.length > 0
        ? "These accounts stopped working on this server and need attention in Metis Suite under Settings → Connections; their mailboxes, calendars and drives are unreachable until then."
        : undefined,
  };
}

export async function createWorkspace(account: AccountCtx, name: string) {
  const created = await createOwnedWorkspace({
    name,
    ownerUserId: account.userId,
  });
  return {
    created: true,
    workspaceId: created.workspaceId,
    slug: created.slug,
    name,
    note: "It starts empty. Mailboxes, calendars and drives attached to it have AI off until you turn it on in Metis Suite.",
  };
}

export async function attachResource(
  account: AccountCtx,
  workspaceId: string,
  args: { kind: ConnectionResource; resourceId: string },
) {
  const base = { userId: account.userId, workspaceId };
  const linked =
    args.kind === "mailbox"
      ? await attachOwnedMailbox({ ...base, mailboxId: args.resourceId })
      : args.kind === "calendar"
        ? await attachOwnedCalendar({ ...base, calendarId: args.resourceId })
        : await attachOwnedDrive({ ...base, driveId: args.resourceId });
  if ("error" in linked) return { error: linked.error };
  return {
    attached: true,
    kind: args.kind,
    resourceId: args.resourceId,
    workspaceId,
    aiEnabled: false,
    note: "AI is off for it in this workspace until you turn it on in Metis Suite, so no tool can read it yet.",
  };
}

export async function listSignupInvites(account: AccountCtx) {
  const rows = await listInvites(account.userId);
  return {
    count: rows.length,
    invites: rows.map((r) => ({
      inviteId: r.id,
      email: r.email,
      expiresAt: r.expiresAt.toISOString(),
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function createSignupInvite(account: AccountCtx, email: string) {
  const sent = await sendSignupInvite({
    email,
    inviter: { userId: account.userId, name: account.userName },
    by: mcpActor(account),
  });
  if ("error" in sent) return sent;
  return {
    invited: true,
    inviteId: sent.invite.id,
    email: sent.invite.email,
    expiresAt: sent.invite.expiresAt.toISOString(),
    delivered: sent.delivered,
    url: sent.delivered ? undefined : sent.url,
    note: sent.delivered
      ? undefined
      : "The invite was created but the email did not go out. Give the user this link to pass on — it is shown only once.",
  };
}

export async function revokeSignupInvite(account: AccountCtx, inviteId: string) {
  const result = await revokeInvite({
    inviteId,
    invitedBy: account.userId,
    by: mcpActor(account),
  });
  if ("error" in result) return result;
  return { revoked: true, inviteId };
}
