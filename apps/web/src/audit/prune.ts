import "server-only";
import { lt } from "drizzle-orm";

import { config } from "@/config";
import { db } from "@/db";
import { auditEvent } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneAuditEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - config.audit.retentionDays * DAY_MS);
  const removed = await db
    .delete(auditEvent)
    .where(lt(auditEvent.createdAt, cutoff))
    .returning({ id: auditEvent.id });
  return removed.length;
}
