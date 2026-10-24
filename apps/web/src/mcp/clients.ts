import "server-only";
import { generateRandomString } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import { getAuth } from "@/auth/server";
import { db } from "@/db";
import { oauthClientResource } from "@/db/auth-schema";
import { mcpClient } from "@/db/schema";

import { MCP_AUDIENCE } from "./auth";
import { MCP_PRESETS, type McpPresetId } from "./presets";
import { uniqueMcpClientSlug } from "./slug";
import type { McpCapabilityPrefs, McpToolPrefs } from "./tools";

export type McpClientRow = typeof mcpClient.$inferSelect;

export async function createManualMcpClient(opts: {
  userId: string;
  label: string;
  preset: McpPresetId;
  redirectUris: string[];
}): Promise<McpClientRow> {
  const clientId = generateRandomString(32, "a-z", "A-Z");
  const slug = await uniqueMcpClientSlug(opts.userId, opts.label);
  const ctx = await getAuth().$context;
  const now = new Date();

  await ctx.adapter.create({
    model: "oauthClient",
    data: {
      clientId,
      clientSecret: null,
      name: opts.label,
      redirectUris: opts.redirectUris,
      scopes: ["offline_access"],
      clientCredentialsScopes: [],
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      applicationType: MCP_PRESETS[opts.preset].clientType,
      requirePKCE: true,
      disabled: false,
      userId: opts.userId,
      createdAt: now,
      updatedAt: now,
    },
  });

  await db.insert(oauthClientResource).values({
    id: crypto.randomUUID(),
    clientId,
    resourceId: MCP_AUDIENCE,
    createdAt: now,
  });

  // oxlint-disable-next-line typescript/no-non-null-assertion --insert ... returning always yields the row
  return (
    await db
      .insert(mcpClient)
      .values({
        clientId,
        userId: opts.userId,
        label: opts.label,
        slug,
        preset: opts.preset,
        enabled: true,
        capabilities: {},
        hiddenWorkspaceIds: [],
        createdAt: now,
      })
      .returning()
  )[0]!;
}

export async function setMcpClientTools(
  clientId: string,
  capabilities: McpCapabilityPrefs,
  tools: McpToolPrefs,
): Promise<void> {
  await db
    .update(mcpClient)
    .set({ capabilities: { ...capabilities, tools } })
    .where(eq(mcpClient.clientId, clientId));
}
