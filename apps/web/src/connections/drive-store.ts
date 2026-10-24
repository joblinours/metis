import { and, desc, eq, isNull, notInArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { connection, drive, driveWorkspace, workspace, workspaceMember } from "@/db/schema";
import { uniqueDriveSlug } from "@/drive/slug";
import { allOf } from "@/lib/sql";
import type { WorkspaceAiPolicy, WorkspacePhishingDetectionPolicy } from "@/types/workspace";
import { resolveDrivePolicy } from "@/workspace/policy";

import {
  CONNECTION_COLUMNS,
  type Connection,
  getConnection,
  revokeConnectionIfUnused,
} from "./connection-store";
import { type ConnectionProvider, type DriveProvider, hasProvider, isDriveProvider } from "./types";

export interface Drive extends Omit<Connection, "provider"> {
  id: string;
  provider: DriveProvider;
  credentials: string | null;
}

export interface WorkspaceDriveRow extends Drive {
  linkId: string;
  workspaceId: string;
  slug: string;
  visibleRootIds: string[];
  aiEnabled: boolean;
  policy: { ai: boolean };
}

export interface DriveWorkspace {
  linkId: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  slug: string;
  aiEnabled: boolean;
  policy: { ai: boolean };
}

const DRIVE_COLUMNS = {
  ...CONNECTION_COLUMNS,
  id: drive.id,
  credentials: connection.credentials,
};

const WORKSPACE_DRIVE_COLUMNS = {
  ...DRIVE_COLUMNS,
  linkId: driveWorkspace.id,
  workspaceId: driveWorkspace.workspaceId,
  slug: driveWorkspace.slug,
  visibleRootIds: driveWorkspace.visibleRootIds,
  aiEnabled: driveWorkspace.aiEnabled,
  aiPolicy: workspace.aiPolicy,
  phishingDetectionPolicy: workspace.phishingDetectionPolicy,
};

type WorkspaceDriveQueryRow = Omit<WorkspaceDriveRow, "policy" | "provider"> & {
  provider: ConnectionProvider;
  aiPolicy: WorkspaceAiPolicy;
  phishingDetectionPolicy: WorkspacePhishingDetectionPolicy;
};

function asDrive<T extends { id: string; provider: ConnectionProvider }>(
  row: T,
): T & { provider: DriveProvider } {
  if (!hasProvider(row, isDriveProvider)) {
    throw new Error(`drive ${row.id} is backed by a ${row.provider} grant`);
  }
  return row;
}

function withPolicy(row: WorkspaceDriveQueryRow): WorkspaceDriveRow {
  const { aiPolicy, phishingDetectionPolicy, ...rest } = asDrive(row);
  return {
    ...rest,
    policy: resolveDrivePolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  };
}

function visibilityWhere(workspaceId: string): SQL {
  return allOf(eq(driveWorkspace.workspaceId, workspaceId), isNull(connection.quarantinedAt));
}

function driveQuery() {
  return db
    .select(DRIVE_COLUMNS)
    .from(drive)
    .innerJoin(connection, eq(connection.id, drive.connectionId));
}

function workspaceDriveQuery() {
  return db
    .select(WORKSPACE_DRIVE_COLUMNS)
    .from(driveWorkspace)
    .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
    .innerJoin(connection, eq(connection.id, drive.connectionId))
    .innerJoin(workspace, eq(workspace.id, driveWorkspace.workspaceId));
}

export async function listWorkspaceDrives(workspaceId: string): Promise<WorkspaceDriveRow[]> {
  const rows = await workspaceDriveQuery()
    .where(visibilityWhere(workspaceId))
    .orderBy(desc(driveWorkspace.createdAt));
  return rows.map(withPolicy);
}

export async function getWorkspaceDriveBySlug(
  slug: string,
  workspaceId: string,
): Promise<WorkspaceDriveRow | null> {
  const [row] = await workspaceDriveQuery()
    .where(and(eq(driveWorkspace.slug, slug), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getWorkspaceDriveByLinkId(
  linkId: string,
  workspaceId: string,
): Promise<WorkspaceDriveRow | null> {
  const [row] = await workspaceDriveQuery()
    .where(and(eq(driveWorkspace.id, linkId), visibilityWhere(workspaceId)))
    .limit(1);
  return row ? withPolicy(row) : null;
}

export async function getDrive(driveId: string, userId: string): Promise<Drive | null> {
  const [row] = await driveQuery()
    .where(and(eq(drive.id, driveId), eq(connection.userId, userId)))
    .limit(1);
  return row ? asDrive(row) : null;
}

export async function getDriveById(driveId: string): Promise<Drive | null> {
  const [row] = await driveQuery().where(eq(drive.id, driveId)).limit(1);
  return row ? asDrive(row) : null;
}

export async function listUserDrives(userId: string): Promise<Drive[]> {
  const rows = await driveQuery()
    .where(eq(connection.userId, userId))
    .orderBy(desc(drive.createdAt));
  return rows.map(asDrive);
}

export async function listUnattachedDrives(userId: string, workspaceId: string): Promise<Drive[]> {
  const attachedHere = db
    .select({ id: driveWorkspace.driveId })
    .from(driveWorkspace)
    .where(eq(driveWorkspace.workspaceId, workspaceId));

  const rows = await driveQuery()
    .where(
      and(
        eq(connection.userId, userId),
        isNull(connection.quarantinedAt),
        notInArray(drive.id, attachedHere),
      ),
    )
    .orderBy(desc(drive.createdAt));
  return rows.map(asDrive);
}

export async function getDriveLink(
  driveId: string,
  workspaceId: string,
): Promise<{ linkId: string; slug: string } | null> {
  const [row] = await db
    .select({ linkId: driveWorkspace.id, slug: driveWorkspace.slug })
    .from(driveWorkspace)
    .where(and(eq(driveWorkspace.driveId, driveId), eq(driveWorkspace.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function listDriveWorkspaces(
  driveId: string,
  userId: string,
): Promise<DriveWorkspace[]> {
  const rows = await db
    .select({
      linkId: driveWorkspace.id,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      slug: driveWorkspace.slug,
      aiEnabled: driveWorkspace.aiEnabled,
      aiPolicy: workspace.aiPolicy,
      phishingDetectionPolicy: workspace.phishingDetectionPolicy,
    })
    .from(driveWorkspace)
    .innerJoin(drive, eq(drive.id, driveWorkspace.driveId))
    .innerJoin(connection, eq(connection.id, drive.connectionId))
    .innerJoin(workspace, eq(workspace.id, driveWorkspace.workspaceId))
    .innerJoin(
      workspaceMember,
      and(eq(workspaceMember.workspaceId, workspace.id), eq(workspaceMember.userId, userId)),
    )
    .where(and(eq(driveWorkspace.driveId, driveId), isNull(connection.quarantinedAt)))
    .orderBy(workspace.name);

  return rows.map(({ aiPolicy, phishingDetectionPolicy, ...rest }) => ({
    ...rest,
    policy: resolveDrivePolicy(rest, { aiPolicy, phishingDetectionPolicy }),
  }));
}

export async function upsertDrive(target: Connection): Promise<Drive> {
  if (!isDriveProvider(target.provider)) {
    throw new Error(`${target.provider} accounts cannot be used as a drive`);
  }
  const [existing] = await db
    .select({ id: drive.id })
    .from(drive)
    .where(eq(drive.connectionId, target.connectionId))
    .limit(1);

  if (!existing) {
    const now = new Date();
    await db.insert(drive).values({
      id: crypto.randomUUID(),
      connectionId: target.connectionId,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [row] = await driveQuery().where(eq(drive.connectionId, target.connectionId)).limit(1);
  if (!row) throw new Error("Failed to persist drive");
  return asDrive(row);
}

export async function attachDrive(args: {
  driveId: string;
  email: string;
  workspaceId: string;
}): Promise<{ linkId: string; slug: string }> {
  const { driveId, email, workspaceId } = args;
  const linkId = crypto.randomUUID();
  const slug = await uniqueDriveSlug(workspaceId, email);
  await db.insert(driveWorkspace).values({
    id: linkId,
    driveId,
    workspaceId,
    slug,
    visibleRootIds: [],
    createdAt: new Date(),
  });
  return { linkId, slug };
}

export async function detachDrive(args: { linkId: string; workspaceId: string }): Promise<void> {
  await db
    .delete(driveWorkspace)
    .where(
      and(eq(driveWorkspace.id, args.linkId), eq(driveWorkspace.workspaceId, args.workspaceId)),
    );
}

export async function setDriveVisibility(args: {
  linkId: string;
  workspaceId: string;
  visibleRootIds: string[];
}): Promise<void> {
  await db
    .update(driveWorkspace)
    .set({ visibleRootIds: args.visibleRootIds })
    .where(
      and(eq(driveWorkspace.id, args.linkId), eq(driveWorkspace.workspaceId, args.workspaceId)),
    );
}

export async function deleteDrive(target: Drive): Promise<boolean> {
  await db.delete(drive).where(eq(drive.id, target.id));
  const owner = await getConnection(target.connectionId, target.userId);
  if (!owner) return false;
  return revokeConnectionIfUnused(owner);
}
