import { and, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { connection, mailbox, mailboxWorkspace, workspace, workspaceMember } from "@/db/schema";
import { allOf } from "@/lib/sql";
import { uniqueMailboxSlug } from "@/mail/slug";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";
import { type ResolvedPolicy, resolveMailboxPolicy } from "@/workspace/policy";

import {
  CONNECTION_COLUMNS,
  type Connection,
  getConnection,
  revokeConnectionIfUnused,
} from "./connection-store";
import { type ConnectionProvider, hasProvider, isMailProvider, type MailProvider } from "./types";

export interface Mailbox extends Omit<Connection, "provider"> {
  id: string;
  provider: MailProvider;
  credentials: string | null;
}

export interface WorkspaceMailboxRow extends Mailbox {
  linkId: string;
  workspaceId: string;
  slug: string;
  aiEnabled: boolean;
  phishingDetectionEnabled: boolean;
  policy: ResolvedPolicy;
}

export interface MailboxWorkspace {
  linkId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  slug: string;
  aiEnabled: boolean;
  phishingDetectionEnabled: boolean;
  policy: ResolvedPolicy;
}

const MAILBOX_COLUMNS = {
  ...CONNECTION_COLUMNS,
  id: mailbox.id,
  credentials: connection.credentials,
};

const WORKSPACE_MAILBOX_COLUMNS = {
  ...MAILBOX_COLUMNS,
  linkId: mailboxWorkspace.id,
  workspaceId: mailboxWorkspace.workspaceId,
  slug: mailboxWorkspace.slug,
  aiEnabled: mailboxWorkspace.aiEnabled,
  phishingDetectionEnabled: mailboxWorkspace.phishingDetectionEnabled,
  aiPolicy: workspace.aiPolicy,
  phishingDetectionPolicy: workspace.phishingDetectionPolicy,
};

type WorkspaceMailboxQueryRow = Omit<WorkspaceMailboxRow, "policy" | "provider"> & {
  provider: ConnectionProvider;
  aiPolicy: WorkspaceAiPolicy;
  phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
};

function asMailbox<T extends { id: string; provider: ConnectionProvider }>(
  row: T,
): T & { provider: MailProvider } {
  if (!hasProvider(row, isMailProvider)) {
    throw new Error(`mailbox ${row.id} is backed by a ${row.provider} grant`);
  }
  return row;
}

function withPolicy(row: WorkspaceMailboxQueryRow): WorkspaceMailboxRow {
  const { aiPolicy, phishingDetectionPolicy, ...rest } = asMailbox(row);
  return {
    ...rest,
    policy: resolveMailboxPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  };
}

function visibilityWhere(workspaceId: string): SQL {
  return allOf(eq(mailboxWorkspace.workspaceId, workspaceId), isNull(connection.quarantinedAt));
}

function mailboxQuery() {
  return db
    .select(MAILBOX_COLUMNS)
    .from(mailbox)
    .innerJoin(connection, eq(connection.id, mailbox.connectionId));
}

function workspaceMailboxQuery() {
  return db
    .select(WORKSPACE_MAILBOX_COLUMNS)
    .from(mailboxWorkspace)
    .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .innerJoin(workspace, eq(workspace.id, mailboxWorkspace.workspaceId));
}

export async function listWorkspaceMailboxes(workspaceId: string): Promise<WorkspaceMailboxRow[]> {
  const rows = await workspaceMailboxQuery()
    .where(visibilityWhere(workspaceId))
    .orderBy(desc(mailboxWorkspace.createdAt));
  return rows.map(withPolicy);
}

export async function getWorkspaceMailboxBySlug(
  slug: string,
  workspaceId: string,
): Promise<WorkspaceMailboxRow | null> {
  const [row] = await workspaceMailboxQuery()
    .where(and(eq(mailboxWorkspace.slug, slug), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getWorkspaceMailboxByLinkId(
  linkId: string,
  workspaceId: string,
): Promise<WorkspaceMailboxRow | null> {
  const [row] = await workspaceMailboxQuery()
    .where(and(eq(mailboxWorkspace.id, linkId), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getMailbox(mailboxId: string, userId: string): Promise<Mailbox | null> {
  const [row] = await mailboxQuery()
    .where(and(eq(mailbox.id, mailboxId), eq(connection.userId, userId)))
    .limit(1);
  return row ? asMailbox(row) : null;
}

export async function listUserMailboxes(userId: string): Promise<Mailbox[]> {
  const rows = await mailboxQuery()
    .where(eq(connection.userId, userId))
    .orderBy(desc(mailbox.createdAt));
  return rows.map(asMailbox);
}

export async function listUnattachedMailboxes(
  userId: string,
  workspaceId: string,
): Promise<Mailbox[]> {
  const attachedHere = db
    .select({ id: mailboxWorkspace.mailboxId })
    .from(mailboxWorkspace)
    .where(eq(mailboxWorkspace.workspaceId, workspaceId));

  const rows = await mailboxQuery()
    .where(
      and(
        eq(connection.userId, userId),
        isNull(connection.quarantinedAt),
        notInArray(mailbox.id, attachedHere),
      ),
    )
    .orderBy(desc(mailbox.createdAt));
  return rows.map(asMailbox);
}

export async function getMailboxLink(
  mailboxId: string,
  workspaceId: string,
): Promise<{ linkId: string; slug: string } | null> {
  const [row] = await db
    .select({ linkId: mailboxWorkspace.id, slug: mailboxWorkspace.slug })
    .from(mailboxWorkspace)
    .where(
      and(eq(mailboxWorkspace.mailboxId, mailboxId), eq(mailboxWorkspace.workspaceId, workspaceId)),
    )
    .limit(1);
  return row ?? null;
}

export async function listMailboxWorkspaces(
  mailboxId: string,
  userId: string,
): Promise<MailboxWorkspace[]> {
  const rows = await db
    .select({
      linkId: mailboxWorkspace.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      slug: mailboxWorkspace.slug,
      aiEnabled: mailboxWorkspace.aiEnabled,
      phishingDetectionEnabled: mailboxWorkspace.phishingDetectionEnabled,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(mailboxWorkspace)
    .innerJoin(mailbox, eq(mailbox.id, mailboxWorkspace.mailboxId))
    .innerJoin(connection, eq(connection.id, mailbox.connectionId))
    .innerJoin(workspace, eq(workspace.id, mailboxWorkspace.workspaceId))
    .innerJoin(
      workspaceMember,
      and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)),
    )
    .where(and(eq(mailboxWorkspace.mailboxId, mailboxId), isNull(connection.quarantinedAt)))
    .orderBy(workspace.name);

  return rows.map(({ aiPolicy, phishingDetectionPolicy, ...rest }) => ({
    ...rest,
    policy: resolveMailboxPolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  }));
}

export async function upsertMailbox(target: Connection): Promise<Mailbox> {
  if (!isMailProvider(target.provider)) {
    throw new Error(`${target.provider} accounts cannot be used as a mailbox`);
  }
  const [existing] = await db
    .select({ id: mailbox.id })
    .from(mailbox)
    .where(eq(mailbox.connectionId, target.connectionId))
    .limit(1);

  if (!existing) {
    const now = new Date();
    await db.insert(mailbox).values({
      id: crypto.randomUUID(),
      connectionId: target.connectionId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await mailboxQuery().where(eq(mailbox.connectionId, target.connectionId)).limit(1);
  if (!row) throw new Error("Failed to persist mailbox");
  return asMailbox(row);
}

export async function attachMailbox(args: {
  mailboxId: string;
  email: string;
  workspaceId: string;
}): Promise<{ linkId: string; slug: string }> {
  const { mailboxId, email, workspaceId } = args;
  const linkId = crypto.randomUUID();
  const slug = await uniqueMailboxSlug(workspaceId, email);
  await db.insert(mailboxWorkspace).values({
    id: linkId,
    mailboxId,
    workspaceId,
    slug,
    createdAt: new Date(),
  });
  return { linkId, slug };
}

export async function detachMailbox(args: { linkId: string; workspaceId: string }): Promise<void> {
  await db
    .delete(mailboxWorkspace)
    .where(
      and(eq(mailboxWorkspace.id, args.linkId), eq(mailboxWorkspace.workspaceId, args.workspaceId)),
    );
}

export async function deleteMailbox(target: Mailbox): Promise<boolean> {
  await db.delete(mailbox).where(eq(mailbox.id, target.id));
  const owner = await getConnection(target.connectionId, target.userId);
  if (!owner) return false;
  return revokeConnectionIfUnused(owner);
}
