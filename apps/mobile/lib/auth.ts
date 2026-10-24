import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from "expo-crypto";
import { z } from "zod";

import { clearStorageData } from "@/modules/metis-shell";

import { errorMessage, requestJson } from "./http";
import { log } from "./log";
import { readPendingLogin, writePendingLogin } from "./store";

const PENDING_LOGIN_TTL_MS = 10 * 60 * 1000;

const sessionSchema = z.object({ session: z.unknown() });
const ticketSchema = z.object({ url: z.string() });
const okSchema = z.object({ ok: z.literal(true) });

export class StaleLoginError extends Error {}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteCount: number): string {
  let binary = "";
  for (const byte of getRandomBytes(byteCount)) {
    binary += String.fromCharCode(byte);
  }
  return toBase64Url(btoa(binary));
}

async function sha256(value: string): Promise<string> {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, value, {
    encoding: CryptoEncoding.BASE64,
  });
  return toBase64Url(digest);
}

export async function beginLogin(server: string): Promise<string> {
  const verifier = randomToken(32);
  const state = randomToken(16);
  const challenge = await sha256(verifier);
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

export async function completeLogin(server: string, code: string, state: string): Promise<void> {
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

  const response = await requestJson("POST", `${server}/api/auth/native/exchange`, {
    code,
    verifier: pending.verifier,
  });
  log("sign-in exchange answered", { status: response.status });
  if (response.status !== 200) {
    throw new Error(errorMessage(response, "Sign-in failed. Try again."));
  }
  const signedIn = await hasSession(server);
  log("session check after exchange", { signedIn });
  if (!signedIn) {
    throw new Error("Sign-in failed. Try again.");
  }
}

export async function hasSession(server: string): Promise<boolean> {
  const response = await requestJson("GET", `${server}/api/auth/get-session`);
  if (response.status !== 200) return false;
  return Boolean(sessionSchema.safeParse(response.json).data?.session);
}

export async function signOut(server: string | null) {
  if (server) {
    try {
      await requestJson("POST", `${server}/api/auth/sign-out`, {});
    } catch {}
  }
  await clearStorageData();
}

export async function connectTicketUrl(server: string, path: string): Promise<string> {
  const response = await requestJson("POST", `${server}/api/auth/native/connect-ticket`, { path });
  const url = ticketSchema.safeParse(response.json).data?.url;
  if (response.status !== 200 || url === undefined) {
    throw new Error(errorMessage(response, "Could not start connecting the account."));
  }
  if (new URL(url).origin !== server) {
    throw new Error("The server returned an unexpected address.");
  }
  return url;
}

export async function checkServer(server: string): Promise<boolean> {
  try {
    const response = await requestJson("GET", `${server}/api/auth/ok`);
    return response.status === 200 && okSchema.safeParse(response.json).success;
  } catch {
    return false;
  }
}
