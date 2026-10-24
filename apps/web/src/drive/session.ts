import type { Auth } from "@/auth/server";
import { getAppUser, isWorkspaceUser, type WorkspaceUserSession } from "@/auth/session";
import {
  type ConnectionAuth,
  getWorkspaceDriveBySlug,
  listWorkspaceDrives,
  resolveConnectionAuth,
  type WorkspaceDriveRow,
} from "@/connections";
import type { WorkspaceRole } from "@/types/workspace";
import { ALL_DRIVES_SLUG } from "@/workspace/path";

import {
  aggregateDriveSurface,
  type DriveSurface,
  driveSurfaceFor,
  type ResolvedDrive,
} from "./aggregate";

export interface DriveSession {
  userId: string;
  user: Auth["$Infer"]["Session"]["user"];
  driveSlug: string;
  isAggregate: boolean;
  drives: ResolvedDrive[];
  surface: DriveSurface;
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: WorkspaceRole;
}

function lazyResolved(found: WorkspaceDriveRow, userId: string): ResolvedDrive {
  let pending: Promise<ConnectionAuth> | null = null;
  return {
    driveId: found.id,
    linkId: found.linkId,
    driveSlug: found.slug,
    email: found.email,
    server: found.server,
    userId,
    ownerUserId: found.userId,
    provider: found.provider,
    visibleRootIds: found.visibleRootIds,
    policy: found.policy,
    auth: () => {
      pending ??= resolveConnectionAuth(found).then((resolved) => {
        if (!resolved) {
          pending = null;
          throw new Error(`Could not authenticate ${found.email}`);
        }
        return resolved;
      });
      return pending;
    },
  };
}

export async function workspaceDrives(
  userId: string,
  workspaceId: string,
): Promise<ResolvedDrive[]> {
  const rows = await listWorkspaceDrives(workspaceId);
  return rows.map((row) => lazyResolved(row, userId));
}

export async function driveSessionFor(
  appUser: WorkspaceUserSession,
  driveSlug: string,
): Promise<DriveSession | null> {
  const base = {
    userId: appUser.userId,
    user: appUser.user,
    workspaceId: appUser.workspaceId,
    workspaceSlug: appUser.workspaceSlug,
    workspaceRole: appUser.workspaceRole,
  };

  if (driveSlug === ALL_DRIVES_SLUG) {
    const drives = await workspaceDrives(appUser.userId, appUser.workspaceId);
    if (drives.length === 0) return null;
    return {
      ...base,
      driveSlug: ALL_DRIVES_SLUG,
      isAggregate: true,
      drives,
      surface: aggregateDriveSurface(drives),
    };
  }

  const found = await getWorkspaceDriveBySlug(driveSlug, appUser.workspaceId);
  if (!found) return null;

  const account = lazyResolved(found, appUser.userId);
  return {
    ...base,
    driveSlug: found.slug,
    isAggregate: false,
    drives: [account],
    surface: driveSurfaceFor(account),
  };
}

export async function getDriveSession(
  headers: Headers,
  workspaceSlug: string,
  driveSlug: string,
): Promise<DriveSession | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  return driveSessionFor(appUser, driveSlug);
}

export async function firstDriveSlug(workspaceId: string): Promise<string | null> {
  const all = await listWorkspaceDrives(workspaceId);
  return all[0]?.slug ?? null;
}
