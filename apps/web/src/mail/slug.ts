import { eq } from "drizzle-orm";

import { db } from "@/db";
import { mailboxWorkspace } from "@/db/schema";
import { uniqueSlug } from "@/lib/slug-ladder";
import { RESERVED_MAILBOX_SLUGS } from "@/workspace/path";

export async function uniqueMailboxSlug(workspaceId: string, email: string): Promise<string> {
  const rows = await db
    .select({ slug: mailboxWorkspace.slug })
    .from(mailboxWorkspace)
    .where(eq(mailboxWorkspace.workspaceId, workspaceId));

  return uniqueSlug({
    taken: new Set(rows.map((r) => r.slug)),
    reserved: RESERVED_MAILBOX_SLUGS,
    email,
    fallback: "mailbox",
  });
}
