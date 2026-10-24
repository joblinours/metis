import "server-only";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { appActor, recordAuditEvent } from "@/audit";
import {
  attachCalendar,
  attachDrive,
  attachMailbox,
  type ConnectionResource,
  credentialResourceFor,
  getCalendarLink,
  getConnection,
  getCredentialDriver,
  getDriveLink,
  getDriver,
  getMailboxLink,
  grantedResources,
  isProviderConfigured,
  listUnavailableConnections,
  listUserConnections,
  resolveServerCredentials,
  revokeConnection,
  upsertCalendar,
  upsertCredentialConnection,
  upsertDrive,
  upsertMailbox,
} from "@/connections";
import { db } from "@/db";
import { calendar, drive, mailbox } from "@/db/schema";
import { isRecord } from "@/lib/guards";
import { rateLimit } from "@/services/rate-limit";
import { getWorkspaceBySlug } from "@/workspace";

import { appSession } from "../middlewares/app-session";
import {
  createCredentialConnectionInputSchema,
  createCredentialConnectionOutputSchema,
  deleteConnectionInputSchema,
  listConnectionsOutputSchema,
  successSchema,
  unavailableConnectionsOutputSchema,
} from "../schema";

const AUTH_CODES = new Set(["AUTHENTICATIONFAILED", "AUTHENTICATION_FAILED", "EAUTH", "NO"]);

const UNREACHABLE_CODES = new Set([
  "CONNECT_TIMEOUT",
  "EAI_AGAIN",
  "ECONNECTION",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ESOCKET",
  "ETIMEDOUT",
  "ETIMEOUT",
  "GREETING_TIMEOUT",
]);

const CERT_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

function errorCodes(err: unknown): string[] {
  const out: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 3 && isRecord(current); depth += 1) {
    const record = current;
    for (const key of ["code", "errno", "serverResponseCode"]) {
      const value = record[key];
      if (typeof value === "string") out.push(value.toUpperCase());
    }
    current = record.cause;
  }
  return out;
}

function connectFailureMessage(err: unknown): string {
  const codes = errorCodes(err);
  const message = err instanceof Error ? err.message : "";
  const flaggedAuth = isRecord(err) && err.authenticationFailed === true;

  if (
    flaggedAuth ||
    codes.some((code) => AUTH_CODES.has(code)) ||
    /\b401\b|unauthor|invalid credentials|authentication failed/i.test(message)
  ) {
    return "That server rejected the username or password.";
  }

  if (
    codes.some((code) => CERT_CODES.has(code) || code.startsWith("ERR_TLS")) ||
    /self[- ]signed|certificate|CERT_/i.test(message)
  ) {
    return "The server's TLS certificate could not be verified.";
  }

  if (codes.some((code) => UNREACHABLE_CODES.has(code))) {
    return "Could not reach that server — it may be down right now.";
  }

  return "Could not sign in to that server. Check your username and password.";
}

export const connectionsRouter = {
  list: appSession.output(listConnectionsOutputSchema).handler(async ({ context }) => {
    const { userId } = context.appUser;
    const rows = await listUserConnections(userId);

    const connections = await Promise.all(
      rows.map(async (row) => {
        const [mailboxes, calendars, drives] = await Promise.all([
          db
            .select({ id: mailbox.id })
            .from(mailbox)
            .where(eq(mailbox.connectionId, row.connectionId)),
          db
            .select({ id: calendar.id })
            .from(calendar)
            .where(eq(calendar.connectionId, row.connectionId)),
          db.select({ id: drive.id }).from(drive).where(eq(drive.connectionId, row.connectionId)),
        ]);

        const linked: ConnectionResource[] = [];
        if (mailboxes.length > 0) linked.push("mailbox");
        if (calendars.length > 0) linked.push("calendar");
        if (drives.length > 0) linked.push("drive");

        return {
          connectionId: row.connectionId,
          provider: row.provider,
          email: row.email,
          server: row.server,
          image: row.image,
          granted: grantedResources(row),
          linked,
        };
      }),
    );

    return { connections };
  }),

  unavailable: appSession
    .output(unavailableConnectionsOutputSchema)
    .handler(async ({ context }) => {
      const rows = await listUnavailableConnections(context.appUser.userId);
      return { connectionIds: rows.map((row) => row.connectionId) };
    }),

  createCredential: appSession
    .input(createCredentialConnectionInputSchema)
    .output(createCredentialConnectionOutputSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;
      const provider = input.credentials.provider;

      if (!isProviderConfigured(provider)) {
        throw new ORPCError("FORBIDDEN", {
          message: `${getDriver(provider).label} accounts are not enabled on this server`,
        });
      }

      const rl = await rateLimit(userId, {
        scope: "connections-credential",
        limit: 10,
        windowSec: 3600,
      });
      if (!rl.ok) {
        throw new ORPCError("TOO_MANY_REQUESTS", {
          message: "Too many connection attempts — try again later",
        });
      }

      const target = input.attachToWorkspaceSlug
        ? await getWorkspaceBySlug(userId, input.attachToWorkspaceSlug)
        : null;
      if (input.attachToWorkspaceSlug && !target) {
        throw new ORPCError("NOT_FOUND", { message: "Unknown workspace" });
      }

      const driver = getCredentialDriver(provider);

      const resolved = resolveServerCredentials(input.credentials);
      if (!resolved) {
        throw new ORPCError("NOT_FOUND", {
          message: "That server is not configured here",
        });
      }

      let profile: Awaited<ReturnType<typeof driver.verify>>;
      try {
        profile = await driver.verify(resolved, input.email);
      } catch (err) {
        console.error("[connections] credential verification failed", err);
        throw new ORPCError("BAD_REQUEST", {
          message: connectFailureMessage(err),
        });
      }

      const resource = credentialResourceFor(provider);
      const account = await upsertCredentialConnection({
        userId,
        provider,
        profile,
        credentials: {
          ...input.credentials,
          serverId: resolved.serverId,
          server: resolved.server,
        },
        resources: [resource],
      });

      if (resource === "drive") {
        const disk = await upsertDrive(account);
        if (!target) {
          return { connectionId: account.connectionId, resource, slug: null };
        }
        const existing = await getDriveLink(disk.id, target.id);
        const link =
          existing ??
          (await attachDrive({
            driveId: disk.id,
            email: disk.email,
            workspaceId: target.id,
          }));
        return {
          connectionId: account.connectionId,
          resource,
          slug: link.slug,
        };
      }

      if (resource === "calendar") {
        const cal = await upsertCalendar(account);
        if (!target) {
          return {
            connectionId: account.connectionId,
            resource,
            slug: null,
          };
        }
        const existing = await getCalendarLink(cal.id, target.id);
        const link =
          existing ??
          (await attachCalendar({
            calendarId: cal.id,
            email: cal.email,
            workspaceId: target.id,
          }));
        return {
          connectionId: account.connectionId,
          resource,
          slug: link.slug,
        };
      }

      const box = await upsertMailbox(account);
      if (!target) {
        return { connectionId: account.connectionId, resource, slug: null };
      }
      const existing = await getMailboxLink(box.id, target.id);
      const link =
        existing ??
        (await attachMailbox({
          mailboxId: box.id,
          email: box.email,
          workspaceId: target.id,
        }));
      return { connectionId: account.connectionId, resource, slug: link.slug };
    }),

  delete: appSession
    .input(deleteConnectionInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const { userId } = context.appUser;

      const target = await getConnection(input.connectionId, userId);
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "Account not found" });
      }

      try {
        await revokeConnection(target);
      } catch (err) {
        console.error("[connections] revoke failed on delete", err);
      }
      await recordAuditEvent(appActor(context.appUser, context.headers), {
        action: "connection.deleted",
        targetLabel: target.email,
        detail: { provider: target.provider },
      });

      return { success: true as const };
    }),
};
