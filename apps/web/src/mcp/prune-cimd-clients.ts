import "server-only";
import { and, eq, isNull, lt, notExists } from "drizzle-orm";

import { db } from "@/db";
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@/db/auth-schema";
import { mcpClient } from "@/db/schema";

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export async function pruneAbandonedCimdClients(now = new Date()) {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS);

  const removed = await db
    .delete(oauthClient)
    .where(
      and(
        eq(oauthClient.clientDiscoveryId, "cimd"),
        lt(oauthClient.createdAt, cutoff),
        notExists(
          db
            .select({ clientId: mcpClient.clientId })
            .from(mcpClient)
            .where(eq(mcpClient.clientId, oauthClient.clientId)),
        ),
        notExists(
          db
            .select({ id: oauthConsent.id })
            .from(oauthConsent)
            .where(eq(oauthConsent.clientId, oauthClient.clientId)),
        ),
        notExists(
          db
            .select({ id: oauthAccessToken.id })
            .from(oauthAccessToken)
            .where(eq(oauthAccessToken.clientId, oauthClient.clientId)),
        ),
        notExists(
          db
            .select({ id: oauthRefreshToken.id })
            .from(oauthRefreshToken)
            .where(
              and(
                eq(oauthRefreshToken.clientId, oauthClient.clientId),
                isNull(oauthRefreshToken.revoked),
              ),
            ),
        ),
      ),
    )
    .returning({ clientId: oauthClient.clientId });

  return removed.length;
}
