import { createHash, randomBytes } from "node:crypto";

import type { Session } from "electron";
import { z } from "zod";

import { errorMessage, requestJson } from "./http";
import { log } from "./log";
import { readPendingLogin, writePendingLogin } from "./store";

const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;

const sessionSchema = z.object({ session: z.unknown() });
const ticketSchema = z.object({ url: z.string() });
const okSchema = z.object({ ok: z.literal(true) });

export class StaleLoginError extends Error {}

export function beginLogin(server: string): string {
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  writePendingLogin({
    server,
    state,
    verifier,
    expiresAt: Date.now() + PENDING_LOGIN_TTL_MS,
  });
  const params = new URLSearchParams({ challenge, state });
  log("sign-in started in browser");
  return `${server}/native/login?${params.toString()}`;
}

export async function completeLogin(
  session: Session,
  server: string,
  code: string,
  state: string,
): Promise<void> {
  const pending = readPendingLogin();
  writePendingLogin(null);
  const reason = !pending
    ? "no pending sign-in"
    : pending.server !== server
      ? "server changed"
      : pending.state !== state
        ? "state mismatch"
        : pending.expiresAt < Date.now()
          ? "expired"
          : null;
  if (!pending || reason) {
    log("sign-in link rejected", { reason });
    throw new StaleLoginError(
      "This sign-in was not started from this app, or it expired. Try again.",
    );
  }

  const response = await requestJson(session, "POST", `${server}/api/auth/native/exchange`, {
    code,
    verifier: pending.verifier,
  });
  log("sign-in exchange answered", { status: response.status });
  if (response.status !== 200) {
    throw new Error(errorMessage(response, "Sign-in failed. Try again."));
  }
  const signedIn = await hasSession(session, server);
  log("session check after exchange", { signedIn });
  if (!signedIn) {
    throw new Error("Sign-in failed. Try again.");
  }
}

export async function hasSession(session: Session, server: string): Promise<boolean> {
  const response = await requestJson(session, "GET", `${server}/api/auth/get-session`);
  if (response.status !== 200) return false;
  return Boolean(sessionSchema.safeParse(response.json).data?.session);
}

export async function signOut(session: Session, server: string | null) {
  if (server) {
    try {
      await requestJson(session, "POST", `${server}/api/auth/sign-out`, {});
    } catch {}
  }
  await session.clearStorageData();
}

export async function connectTicketUrl(
  session: Session,
  server: string,
  path: string,
): Promise<string> {
  const response = await requestJson(session, "POST", `${server}/api/auth/native/connect-ticket`, {
    path,
  });
  const url = ticketSchema.safeParse(response.json).data?.url;
  if (response.status !== 200 || url === undefined) {
    throw new Error(errorMessage(response, "Could not start connecting the account."));
  }
  if (new URL(url).origin !== server) {
    throw new Error("The server returned an unexpected address.");
  }
  return url;
}

export async function checkServer(session: Session, server: string): Promise<boolean> {
  try {
    const response = await requestJson(session, "GET", `${server}/api/auth/ok`);
    return response.status === 200 && okSchema.safeParse(response.json).success;
  } catch {
    return false;
  }
}
