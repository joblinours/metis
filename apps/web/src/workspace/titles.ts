import "server-only";
import { getAppUser, isWorkspaceUser } from "@/auth/session";
import {
  getWorkspaceCalendarBySlug,
  getWorkspaceDriveBySlug,
  getWorkspaceMailboxBySlug,
} from "@/connections";
import type { WorkspaceRole } from "@/types/workspace";

import { ALL_CALENDARS_SLUG, ALL_DRIVES_SLUG, ALL_MAILBOXES_SLUG } from "./path";

type ResourceLookup = (
  slug: string,
  userId: string,
  workspaceId: string,
  role: WorkspaceRole,
) => Promise<{ email: string } | null>;

async function resourceTitle(
  headers: Headers,
  workspaceSlug: string,
  resourceSlug: string,
  allSlug: string,
  allLabel: string,
  lookup: ResourceLookup,
): Promise<string | null> {
  const appUser = await getAppUser(headers, workspaceSlug);
  if (!isWorkspaceUser(appUser)) return null;
  if (resourceSlug === allSlug) return allLabel;
  const row = await lookup(
    resourceSlug,
    appUser.userId,
    appUser.workspaceId,
    appUser.workspaceRole,
  );
  return row?.email ?? null;
}

export function mailboxTitle(
  headers: Headers,
  workspaceSlug: string,
  mailboxSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    mailboxSlug,
    ALL_MAILBOXES_SLUG,
    "All mailboxes",
    getWorkspaceMailboxBySlug,
  );
}

export function calendarTitle(
  headers: Headers,
  workspaceSlug: string,
  calendarSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    calendarSlug,
    ALL_CALENDARS_SLUG,
    "All calendars",
    getWorkspaceCalendarBySlug,
  );
}

export function driveTitle(
  headers: Headers,
  workspaceSlug: string,
  driveSlug: string,
): Promise<string | null> {
  return resourceTitle(
    headers,
    workspaceSlug,
    driveSlug,
    ALL_DRIVES_SLUG,
    "All drives",
    getWorkspaceDriveBySlug,
  );
}
