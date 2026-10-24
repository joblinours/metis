import "server-only";
import { and, desc, eq, isNull, lte } from "drizzle-orm";

import { getConfigVersion } from "@/config/runtime";
import { db } from "@/db";
import { preflightRun, user } from "@/db/schema";
import type { DashboardPreflight } from "@/server/schema";
import type { PreflightWarning } from "@/types/preflight";

const KEEP_RUNS = 20;

export async function recordPreflightRun(run: {
  configVersion: number;
  warnings: PreflightWarning[];
}): Promise<number> {
  const [row] = await db
    .insert(preflightRun)
    .values({
      ranAt: new Date(),
      configVersion: run.configVersion,
      warnings: run.warnings,
    })
    .returning({ id: preflightRun.id });
  if (!row) throw new Error("Recording the preflight run returned no row");
  await db.delete(preflightRun).where(lte(preflightRun.id, row.id - KEEP_RUNS));
  return row.id;
}

export async function latestPreflightRun(): Promise<DashboardPreflight> {
  const [row] = await db
    .select({
      id: preflightRun.id,
      ranAt: preflightRun.ranAt,
      configVersion: preflightRun.configVersion,
      warnings: preflightRun.warnings,
      acknowledgedAt: preflightRun.acknowledgedAt,
      acknowledgedByName: user.name,
      acknowledgedByEmail: user.email,
    })
    .from(preflightRun)
    .leftJoin(user, eq(user.id, preflightRun.acknowledgedByUserId))
    .orderBy(desc(preflightRun.id))
    .limit(1);

  return {
    currentVersion: getConfigVersion(),
    run: row
      ? {
          id: row.id,
          ranAt: row.ranAt.toISOString(),
          configVersion: row.configVersion,
          warnings: row.warnings,
          acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
          acknowledgedBy: row.acknowledgedByEmail
            ? {
                name: row.acknowledgedByName ?? row.acknowledgedByEmail,
                email: row.acknowledgedByEmail,
              }
            : null,
        }
      : null,
  };
}

export async function acknowledgePreflightRun(
  id: number,
  userId: string,
): Promise<DashboardPreflight> {
  await db
    .update(preflightRun)
    .set({ acknowledgedAt: new Date(), acknowledgedByUserId: userId })
    .where(and(eq(preflightRun.id, id), isNull(preflightRun.acknowledgedAt)));
  return latestPreflightRun();
}
