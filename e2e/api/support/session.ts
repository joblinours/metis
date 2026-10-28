import { mkdir, readFile, writeFile } from "node:fs/promises";

import * as OTPAuth from "otpauth";
import { z } from "zod";

import { type Account, harness } from "../../clients/harness";
import { type Rpc, rpcWithCookie } from "../../clients/rpc";

const STATE_DIR = new URL("../.state/", import.meta.url);
const STATE = new URL("session.json", STATE_DIR);

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
