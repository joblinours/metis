import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { BetterAuthPlugin, User } from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { isRecord } from "@/lib/guards";

import { isNativeChallenge, isNativeToken } from "./native-link";
import { sanitizeCallbackPath } from "./two-factor-callback";

const LOGIN_CODE_TTL_MS = 60 * 1000;
const CONNECT_TICKET_TTL_MS = 2 * 60 * 1000;
const CONNECT_START_PREFIX = "/api/connections/start/";

export const NATIVE_TICKET_PARAM = "nativeTicket";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function sameDigest(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function loginCodeIdentifier(code: string): string {
  return `native-login:${sha256(code)}`;
}

export function connectTicketIdentifier(ticket: string): string {
  return `native-connect:${sha256(ticket)}`;
}

export function parseConnectTicket(raw: string): { userId: string; pathname: string } | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.userId !== "string") return null;
    if (typeof parsed.pathname !== "string") return null;
    return { userId: parsed.userId, pathname: parsed.pathname };
  } catch {
    return null;
  }
}

function hasTwoFactor(user: User): boolean {
  return "twoFactorEnabled" in user && user.twoFactorEnabled === true;
}

function parseLoginCode(raw: string): { userId: string; challenge: string } | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.userId !== "string") return null;
    if (!isNativeChallenge(parsed.challenge)) return null;
    return { userId: parsed.userId, challenge: parsed.challenge };
  } catch {
    return null;
  }
}

export const native = () =>
  ({
    id: "metis-native",
    endpoints: {
      createNativeLoginCode: createAuthEndpoint(
        "/native/code",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({ challenge: z.string() }),
        },
        async (ctx) => {
          if (!isNativeChallenge(ctx.body.challenge)) {
            throw ctx.error("BAD_REQUEST", { message: "Invalid challenge" });
          }
          if (!hasTwoFactor(ctx.context.session.user)) {
            throw ctx.error("FORBIDDEN", {
              message: "Set up two-factor authentication first.",
            });
          }
          const code = newToken();
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: loginCodeIdentifier(code),
            value: JSON.stringify({
              userId: ctx.context.session.user.id,
              challenge: ctx.body.challenge,
            }),
            expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS),
          });
          return ctx.json({ code });
        },
      ),
      exchangeNativeLoginCode: createAuthEndpoint(
        "/native/exchange",
        {
          method: "POST",
          body: z.object({ code: z.string(), verifier: z.string() }),
        },
        async (ctx) => {
          const { code, verifier } = ctx.body;
          if (!isNativeToken(code) || !isNativeToken(verifier)) {
            throw ctx.error("BAD_REQUEST", { message: "Invalid code" });
          }
          const row = await ctx.context.internalAdapter.consumeVerificationValue(
            loginCodeIdentifier(code),
          );
          const grant = row ? parseLoginCode(row.value) : null;
          if (!grant || !sameDigest(sha256(verifier), grant.challenge)) {
            throw ctx.error("BAD_REQUEST", { message: "Invalid code" });
          }
          const user = await ctx.context.internalAdapter.findUserById(grant.userId);
          if (!user) {
            throw ctx.error("BAD_REQUEST", { message: "Invalid code" });
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
      createNativeConnectTicket: createAuthEndpoint(
        "/native/connect-ticket",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({ path: z.string() }),
        },
        async (ctx) => {
          const path = sanitizeCallbackPath(ctx.body.path);
          if (!path?.startsWith(CONNECT_START_PREFIX)) {
            throw ctx.error("BAD_REQUEST", { message: "Invalid path" });
          }
          if (!hasTwoFactor(ctx.context.session.user)) {
            throw ctx.error("FORBIDDEN", {
              message: "Set up two-factor authentication first.",
            });
          }
          const url = new URL(path, ctx.context.baseURL);
          url.searchParams.delete(NATIVE_TICKET_PARAM);
          const ticket = newToken();
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: connectTicketIdentifier(ticket),
            value: JSON.stringify({
              userId: ctx.context.session.user.id,
              pathname: url.pathname,
            }),
            expiresAt: new Date(Date.now() + CONNECT_TICKET_TTL_MS),
          });
          url.searchParams.set(NATIVE_TICKET_PARAM, ticket);
          return ctx.json({ url: url.toString() });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
