import "server-only";
import { and, count, eq, inArray, isNotNull, isNull, not, or } from "drizzle-orm";

import type { InstanceConfig } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import { db } from "@/db";
import { connection } from "@/db/schema";

import { parseConnectionCredentials } from "./credential-schema";
import { connectServers, resolveServerCredentials } from "./servers";
import { isCredentialProvider } from "./types";

export interface QuarantineResult {
  providers: string[];
  missingServers: number;
  quarantined: number;
  restored: number;
  unavailable: number;
}

export async function reconcileQuarantine(
  cfg: InstanceConfig = getInstanceConfig(),
): Promise<QuarantineResult> {
  const configuredProviders = [...new Set(connectServers(cfg).map((server) => server.provider))];
  const credentialProviders = configuredProviders.filter(isCredentialProvider);

  const missingServerIds: string[] = [];
  const renamed: { id: string; name: string }[] = [];
  if (credentialProviders.length > 0) {
    const rows = await db
      .select({
        id: connection.id,
        credentials: connection.credentials,
        serverName: connection.serverName,
      })
      .from(connection)
      .where(inArray(connection.provider, credentialProviders));

    for (const row of rows) {
      let resolved: ReturnType<typeof resolveServerCredentials> = null;
      try {
        const stored = parseConnectionCredentials(JSON.parse(row.credentials ?? ""));
        resolved = resolveServerCredentials(stored, cfg);
      } catch {}
      if (!resolved) missingServerIds.push(row.id);
      else if (row.serverName !== resolved.server) {
        renamed.push({ id: row.id, name: resolved.server });
      }
    }
  }

  await Promise.all(
    renamed.map(({ id, name }) =>
      db.update(connection).set({ serverName: name }).where(eq(connection.id, id)),
    ),
  );

  const missingServers =
    missingServerIds.length > 0 ? inArray(connection.id, missingServerIds) : undefined;

  const unconfiguredProvider = not(inArray(connection.provider, configuredProviders));

  const quarantined = await db
    .update(connection)
    .set({ quarantinedAt: new Date() })
    .where(
      and(
        isNull(connection.quarantinedAt),
        missingServers ? or(unconfiguredProvider, missingServers) : unconfiguredProvider,
      ),
    )
    .returning({ id: connection.id });

  const restored = await db
    .update(connection)
    .set({ quarantinedAt: null })
    .where(
      and(
        isNotNull(connection.quarantinedAt),
        inArray(connection.provider, configuredProviders),
        missingServers ? not(missingServers) : undefined,
      ),
    )
    .returning({ id: connection.id });

  const [unavailable] = await db
    .select({ total: count() })
    .from(connection)
    .where(isNotNull(connection.quarantinedAt));

  return {
    providers: configuredProviders,
    missingServers: missingServerIds.length,
    quarantined: quarantined.length,
    restored: restored.length,
    unavailable: unavailable?.total ?? 0,
  };
}

export async function backfillServerIds(
  cfg: InstanceConfig = getInstanceConfig(),
): Promise<{ updated: number; unresolved: number }> {
  const rows = await db
    .select({
      id: connection.id,
      credentials: connection.credentials,
      server: connection.server,
    })
    .from(connection)
    .where(isNotNull(connection.credentials));

  let updated = 0;
  let unresolved = 0;
  const writes: Promise<unknown>[] = [];
  for (const row of rows) {
    let stored: ReturnType<typeof parseConnectionCredentials>;
    try {
      stored = parseConnectionCredentials(JSON.parse(row.credentials ?? ""));
    } catch {
      continue;
    }
    if (stored.serverId) continue;
    const resolved = resolveServerCredentials(stored, cfg);
    if (!resolved) {
      unresolved += 1;
      writes.push(
        db
          .update(connection)
          .set({ serverName: stored.server })
          .where(and(eq(connection.id, row.id), isNull(connection.serverName))),
      );
      continue;
    }
    writes.push(
      db
        .update(connection)
        .set({
          credentials: JSON.stringify({ ...stored, serverId: resolved.serverId }),
          server: resolved.serverId,
          serverName: resolved.server,
        })
        .where(eq(connection.id, row.id)),
    );
    updated += 1;
  }
  await Promise.all(writes);
  return { updated, unresolved };
}
