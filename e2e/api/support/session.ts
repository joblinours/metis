import { mkdir, readFile, writeFile } from "node:fs/promises";

import * as OTPAuth from "otpauth";
import { z } from "zod";

import { type Account, APP, harness } from "../../clients/harness";
import { type Rpc, rpcWithCookie } from "../../clients/rpc";

const STATE_DIR = new URL("../.state/", import.meta.url);
const STATE = new URL("session.json", STATE_DIR);

export async function signIn(
  email: string,
  password: string,
  code: () => Promise<string> | string,
): Promise<string> {
  const jar = new Map<string, string>();
  const cookie = () =>
    [...jar]
      .filter(([, value]) => value !== "")
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${APP}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP,
        cookie: cookie(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
    }
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(";")[0] ?? "";
      const at = pair.indexOf("=");
      if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return z.record(z.string(), z.unknown()).parse(await res.json());
  };

  const signedIn = await post("/sign-in/email", { email, password });
  if (signedIn.twoFactorRedirect) {
    await post("/two-factor/verify-totp", { code: await code() });
  }
  return cookie();
}

export function totpCode(totpURI: string): string {
  const totp = OTPAuth.URI.parse(totpURI);
  if (!(totp instanceof OTPAuth.TOTP)) throw new Error("not a TOTP URI");
  return totp.generate();
}

export async function saveSession(cookie: string): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(STATE, JSON.stringify({ cookie }));
}

export interface Session {
  account: Account;
  cookie: string;
  rpc: Rpc;
}

let session: Promise<Session> | undefined;

export function ana(): Promise<Session> {
  session ??= (async () => {
    const { cookie } = z
      .object({ cookie: z.string() })
      .parse(JSON.parse(await readFile(STATE, "utf8")));
    return {
      account: await harness.account(),
      cookie,
      rpc: rpcWithCookie(cookie),
    };
  })();
  return session;
}

export function scope(account: Account) {
  return { workspaceSlug: account.workspaceSlug };
}

export function mailboxScope(account: Account) {
  return { ...scope(account), mailboxSlug: account.mailboxSlug };
}
