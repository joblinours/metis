import "server-only";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { drivePin } from "@/db/schema";

import type { ResolvedDrive } from "./aggregate";

export interface DrivePinView {
  id: string;
  driveId: string;
  driveSlug: string;
  folderId: string;
  label: string;
}

export async function listDrivePins(
  userId: string,
  drives: ResolvedDrive[],
): Promise<DrivePinView[]> {
  const byId = new Map(drives.map((account) => [account.driveId, account]));
  if (byId.size === 0) return [];
  const rows = await db
    .select()
    .from(drivePin)
    .where(and(eq(drivePin.userId, userId), inArray(drivePin.driveId, [...byId.keys()])))
    .orderBy(drivePin.createdAt);

  return rows.flatMap((row) => {
    const account = byId.get(row.driveId);
    if (!account) return [];
    return [
      {
        id: row.id,
        driveId: row.driveId,
        driveSlug: account.driveSlug,
        folderId: row.folderId,
        label: row.label,
      },
    ];
  });
}

export async function pinDriveFolder(opts: {
  userId: string;
  driveId: string;
  folderId: string;
  label: string;
}): Promise<void> {
  await db
    .insert(drivePin)
    .values({
      id: crypto.randomUUID(),
      userId: opts.userId,
      driveId: opts.driveId,
      folderId: opts.folderId,
      label: opts.label,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function unpinDriveFolder(opts: { userId: string; pinId: string }): Promise<boolean> {
  const removed = await db
    .delete(drivePin)
    .where(and(eq(drivePin.id, opts.pinId), eq(drivePin.userId, opts.userId)))
    .returning({ id: drivePin.id });
  return removed.length > 0;
}
