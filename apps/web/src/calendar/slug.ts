import { eq } from "drizzle-orm";

import { db } from "@/db";
import { calendarWorkspace } from "@/db/schema";
import { uniqueSlug } from "@/lib/slug-ladder";
import { RESERVED_CALENDAR_SLUGS } from "@/workspace/path";

export async function uniqueCalendarSlug(workspaceId: string, email: string): Promise<string> {
  const rows = await db
    .select({ slug: calendarWorkspace.slug })
    .from(calendarWorkspace)
    .where(eq(calendarWorkspace.workspaceId, workspaceId));

  return uniqueSlug({
    taken: new Set(rows.map((r) => r.slug)),
    reserved: RESERVED_CALENDAR_SLUGS,
    email,
    fallback: "calendar",
  });
}
