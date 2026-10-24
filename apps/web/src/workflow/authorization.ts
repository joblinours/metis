import "server-only";
import { and, eq } from "drizzle-orm";

import { isMailProvider, resolveConnectionAuth } from "@/connections";
import type { MailProvider } from "@/connections/types";
import { db } from "@/db";
import { connection, mailbox, mailboxWorkspace, workspaceMember } from "@/db/schema";
import { getMailAdapter, type MailAdapter } from "@/mail/adapter";
import type { WorkspaceRole } from "@/types/workspace";
import { getWorkspacePolicy } from "@/workspace";
import { resolveMailboxPolicy } from "@/workspace/policy";

import type { DefinitionRow } from "./store";

export interface BackgroundPrincipal {
  userId: string | null;
  workspaceId: string | null;
  role: WorkspaceRole | null;
}

export interface MailboxAccess {
  mailboxId: string;
  linkId: string | null;
  provider: MailProvider;
  email: string;
}

export interface AuthorizedMailbox extends MailboxAccess {
  adapter: MailAdapter;
}

export type Authorization<T> = { ok: true; value: T } | { ok: false; reason: string };

function blocked(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

async function membershipRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const [member] = await db
    .select({ role: workspaceMember.role })
    .from(workspaceMember)
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.userId, userId)))
    .limit(1);
  return member?.role ?? null;
}

export async function resolvePrincipal(
  definition: DefinitionRow,
): Promise<Authorization<BackgroundPrincipal>> {
  if (definition.kind === "system") {
    return { ok: true, value: { userId: null, workspaceId: null, role: null } };
  }
  if (!definition.principalUserId) {
    return blocked("This workflow has no execution principal");
  }
  if (!definition.workspaceId) {
    return {
      ok: true,
      value: {
        userId: definition.principalUserId,
        workspaceId: null,
        role: null,
      },
    };
  }

  const role = await membershipRole(definition.workspaceId, definition.principalUserId);

  if (!role && definition.kind === "user") {
    return blocked("The workflow's owner is no longer in this workspace");
  }

  return {
    ok: true,
    value: {
      userId: definition.principalUserId,
      workspaceId: definition.workspaceId,
      role,
    },
  };
}

const MAILBOX_AUTH_COLUMNS = {
  mailboxId: mailbox.id,
  connectionId: connection.id,
  ownerUserId: connection.userId,
  provider: connection.provider,
  email: connection.email,
  accessToken: connection.accessToken,
  refreshToken: connection.refreshToken,
  accessTokenExpiresAt: connection.accessTokenExpiresAt,
  quarantinedAt: connection.quarantinedAt,
  credentials: connection.credentials,
};

function mailboxRowQuery(mailboxId: string) {
  return db
    .select(MAILBOX_AUTH_COLUMNS)
    .from(mailbox)
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .where(eq(mailbox.id, mailboxId))
    .limit(1);
}

type MailboxAuthRow = Awaited<ReturnType<typeof mailboxRowQuery>>[number];

async function workspaceLink(
  mailboxId: string,
  workspaceId: string,
): Promise<{ id: string } | null> {
  const [link] = await db
    .select({ id: mailboxWorkspace.id })
    .from(mailboxWorkspace)
    .where(
      and(eq(mailboxWorkspace.mailboxId, mailboxId), eq(mailboxWorkspace.workspaceId, workspaceId)),
    )
    .limit(1);
  return link ?? null;
}

async function checkAccess(
  definition: DefinitionRow,
  principal: BackgroundPrincipal,
  row: MailboxAuthRow,
): Promise<Authorization<string | null>> {
  if (definition.kind === "system") return { ok: true, value: null };
  if (!principal.userId) {
    return blocked("This workflow has no execution principal");
  }
  if (definition.kind === "user") {
    if (!principal.workspaceId) {
      return blocked("This workflow has no execution principal");
    }
    const link = await workspaceLink(row.mailboxId, principal.workspaceId);
    if (!link) {
      return blocked("That mailbox is no longer attached to this workspace");
    }
    return { ok: true, value: link.id };
  }

  if (row.ownerUserId === principal.userId) {
    return { ok: true, value: definition.originLinkId };
  }
  if (!principal.workspaceId || !principal.role) {
    return blocked("The scheduling user is no longer in that workspace");
  }
  const link = await workspaceLink(row.mailboxId, principal.workspaceId);
  if (!link) {
    return blocked("That mailbox is no longer attached to that workspace");
  }
  return { ok: true, value: link.id };
}

async function loadMailboxRow(
  mailboxId: string,
): Promise<Authorization<MailboxAuthRow & { provider: MailProvider }>> {
  const [row] = await mailboxRowQuery(mailboxId);

  if (!row) return blocked("That mailbox no longer exists");
  if (!isMailProvider(row.provider)) {
    return blocked("That connection no longer carries a mailbox");
  }
  if (row.quarantinedAt) {
    return blocked("That mailbox's connection is unavailable");
  }
  return { ok: true, value: { ...row, provider: row.provider } };
}

export async function authorizeMailboxAccess(opts: {
  definition: DefinitionRow;
  principal: BackgroundPrincipal;
  mailboxId: string;
}): Promise<Authorization<MailboxAccess>> {
  const row = await loadMailboxRow(opts.mailboxId);
  if (!row.ok) return row;

  const access = await checkAccess(opts.definition, opts.principal, row.value);
  if (!access.ok) return access;

  return {
    ok: true,
    value: {
      mailboxId: row.value.mailboxId,
      linkId: access.value,
      provider: row.value.provider,
      email: row.value.email,
    },
  };
}

export async function authorizeMailboxAi(opts: {
  principal: BackgroundPrincipal;
  mailboxId: string;
}): Promise<Authorization<true>> {
  const off = blocked("AI is turned off for this mailbox");
  if (!opts.principal.workspaceId) return off;
  const [link, policy] = await Promise.all([
    db
      .select({
        aiEnabled: mailboxWorkspace.aiEnabled,
        phishingDetectionEnabled: mailboxWorkspace.phishingDetectionEnabled,
      })
      .from(mailboxWorkspace)
      .where(
        and(
          eq(mailboxWorkspace.mailboxId, opts.mailboxId),
          eq(mailboxWorkspace.workspaceId, opts.principal.workspaceId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    getWorkspacePolicy(opts.principal.workspaceId),
  ]);
  if (!link || !policy) return off;
  return resolveMailboxPolicy(link, policy).ai ? { ok: true, value: true } : off;
}

export async function authorizeMailbox(opts: {
  definition: DefinitionRow;
  principal: BackgroundPrincipal;
  mailboxId: string;
}): Promise<Authorization<AuthorizedMailbox>> {
  const row = await loadMailboxRow(opts.mailboxId);
  if (!row.ok) return row;

  const access = await checkAccess(opts.definition, opts.principal, row.value);
  if (!access.ok) return access;

  const auth = await resolveConnectionAuth({
    connectionId: row.value.connectionId,
    provider: row.value.provider,
    accessToken: row.value.accessToken,
    refreshToken: row.value.refreshToken,
    accessTokenExpiresAt: row.value.accessTokenExpiresAt,
    quarantinedAt: row.value.quarantinedAt,
    email: row.value.email,
    credentials: row.value.credentials,
  });
  if (!auth) return blocked("Could not authenticate that mailbox");

  return {
    ok: true,
    value: {
      mailboxId: row.value.mailboxId,
      linkId: access.value,
      provider: row.value.provider,
      email: row.value.email,
      adapter: getMailAdapter(row.value.provider, auth, row.value.mailboxId),
    },
  };
}
