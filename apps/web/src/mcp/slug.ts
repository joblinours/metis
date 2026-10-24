import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mcpClient } from "@/db/schema";
import { uniqueNameSlug } from "@/lib/slug-ladder";

export async function uniqueMcpClientSlug(userId: string, label: string): Promise<string> {
  const rows = await db
    .select({ slug: mcpClient.slug })
    .from(mcpClient)
    .where(eq(mcpClient.userId, userId));

  return uniqueNameSlug({
    taken: new Set(rows.map((r) => r.slug)),
    name: label,
    fallback: "client",
  });
}
