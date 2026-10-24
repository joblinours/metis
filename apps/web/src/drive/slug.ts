import { eq } from "drizzle-orm";

import { db } from "@/db";
import { driveWorkspace } from "@/db/schema";
import { uniqueSlug } from "@/lib/slug-ladder";
import { RESERVED_DRIVE_SLUGS } from "@/workspace/path";

export async function uniqueDriveSlug(workspaceId: string, email: string): Promise<string> {
  const rows = await db
    .select({ slug: driveWorkspace.slug })
    .from(driveWorkspace)
    .where(eq(driveWorkspace.workspaceId, workspaceId));

  return uniqueSlug({
    taken: new Set(rows.map((r) => r.slug)),
    reserved: RESERVED_DRIVE_SLUGS,
    email,
    fallback: "drive",
  });
}
