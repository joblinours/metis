import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  isRestorablePath,
  normalizeServer,
  type PendingLogin,
  parseStored,
  type Stored,
} from "@metis/shell-core/store";
import { app } from "electron";

let cached: Stored | null = null;

function file(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function read(): Stored {
  if (cached) return cached;
  try {
    cached = parseStored(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    cached = {};
  }
  return cached;
}

function write(next: Stored): void {
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(next, null, 2), { mode: 0o600 });
  cached = next;
}

export function readServer(): string | null {
  const server = read().server;
  return server ? normalizeServer(server) : null;
}

export function writeServer(server: string | null): void {
  const { pendingLogin: _, server: __, lastPath: ___, ...rest } = read();
  write(server ? { ...rest, server } : rest);
}

export function readLastPath(): string | null {
  const lastPath = read().lastPath;
  return typeof lastPath === "string" && isRestorablePath(lastPath) ? lastPath : null;
}

export function writeLastPath(pathname: string | null): void {
  const stored = read();
  if ((stored.lastPath ?? null) === pathname) return;
  const { lastPath: _, ...rest } = stored;
  write(pathname ? { ...rest, lastPath: pathname } : rest);
}

export function readStoredSettings(): unknown {
  return read().settings;
}

export function writeStoredSettings(settings: unknown): void {
  write({ ...read(), settings });
}

export function resetStore(): void {
  write({});
}

export function readPendingLogin(): PendingLogin | null {
  return read().pendingLogin ?? null;
}

export function writePendingLogin(pending: PendingLogin | null): void {
  const { pendingLogin: _, ...rest } = read();
  write(pending ? { ...rest, pendingLogin: pending } : rest);
}
