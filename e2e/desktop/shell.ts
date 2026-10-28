import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { _electron, type ElectronApplication, expect, type Page } from "@playwright/test";
import { z } from "zod";

import { APP, harness } from "../clients/harness";
import { signIn } from "../clients/sign-in";

const DESKTOP = fileURLToPath(new URL("../../apps/desktop/", import.meta.url));
const ELECTRON = z.string().parse(createRequire(import.meta.url)("electron"));
const OPENED = "metisOpened";
const X11 = "--ozone-platform=x11";

export interface Shell {
  app: ElectronApplication;
  window: Page;
  env: Record<string, string>;
  close(): Promise<void>;
}

function baseEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

export async function launchShell(): Promise<Shell> {
  const config = await mkdtemp(path.join(os.tmpdir(), "metis-desktop-"));
  const env = { ...baseEnv(), XDG_CONFIG_HOME: config };
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [X11, DESKTOP],
    env,
  });
  await app.evaluate(({ shell }, key) => {
    const opened: string[] = [];
    Reflect.set(globalThis, key, opened);
    shell.openExternal = async (url: string) => {
      opened.push(url);
    };
  }, OPENED);
  const window = await app.firstWindow();
  return {
    app,
    window,
    env,
    async close() {
      await app.close();
      await rm(config, { recursive: true, force: true });
    },
  };
}

export async function openedUrls(shell: Shell): Promise<string[]> {
  return z
    .array(z.string())
    .parse(await shell.app.evaluate((_main, key) => Reflect.get(globalThis, key), OPENED));
}

export async function pairServer(shell: Shell, address: string): Promise<void> {
  const window = shell.window;
  await window.getByLabel("Server address").fill(address);
  await window.getByRole("button", { name: "Continue" }).click();
}

export async function nativeLoginCode(challenge: string): Promise<string> {
  const account = await harness.account();
  const cookie = await signIn(account.email, account.password, () => harness.totp());
  const res = await fetch(`${APP}/api/auth/native/code`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: APP, cookie },
    body: JSON.stringify({ challenge }),
  });
  if (!res.ok) throw new Error(`/native/code: HTTP ${res.status} ${await res.text()}`);
  return z.object({ code: z.string() }).parse(await res.json()).code;
}

export async function deliverLink(shell: Shell, link: string): Promise<void> {
  const second = spawn(ELECTRON, ["--no-sandbox", X11, DESKTOP, link], {
    env: shell.env,
    stdio: "ignore",
  });
  await new Promise<void>((resolve, reject) => {
    second.once("error", reject);
    second.once("exit", () => resolve());
  });
}

export async function signInThroughBrowser(shell: Shell): Promise<void> {
  const window = shell.window;
  await window.getByRole("button", { name: "Sign in with browser" }).click();
  await expect.poll(async () => (await openedUrls(shell)).length).toBeGreaterThan(0);
  const login = new URL((await openedUrls(shell)).at(-1) ?? "");
  expect(`${login.origin}${login.pathname}`).toBe(`${APP}/native/login`);
  const challenge = login.searchParams.get("challenge") ?? "";
  const state = login.searchParams.get("state") ?? "";
  const code = await nativeLoginCode(challenge);
  const params = new URLSearchParams({ code, state });
  await deliverLink(shell, `metis-suite://auth?${params.toString()}`);
}
