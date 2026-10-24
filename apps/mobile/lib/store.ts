import * as SecureStore from "expo-secure-store";
import { z } from "zod";

const pendingLoginSchema = z.object({
  server: z.string(),
  state: z.string(),
  verifier: z.string(),
  expiresAt: z.number(),
});
export type PendingLogin = z.infer<typeof pendingLoginSchema>;

const storedSchema = z.object({
  server: z.string().optional().catch(undefined),
  pendingLogin: pendingLoginSchema.optional().catch(undefined),
  settings: z.unknown().optional(),
  lastPath: z.string().optional().catch(undefined),
});
type Stored = z.infer<typeof storedSchema>;

const KEY = "metis.config";

const RESTORABLE_PATH = /^\/w\/[^/?#\\]+(\/[^?#\\]*)?(\?[^#\\]*)?$/;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function read(): Stored {
  try {
    const raw = SecureStore.getItem(KEY);
    return raw ? storedSchema.catch({}).parse(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function write(next: Stored): void {
  SecureStore.setItem(KEY, JSON.stringify(next));
}

export function normalizeServer(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
    return url.origin;
  }
  return null;
}

export function readServer(): string | null {
  const server = read().server;
  return server ? normalizeServer(server) : null;
}

export function writeServer(server: string | null): void {
  const { pendingLogin: _, server: __, lastPath: ___, ...rest } = read();
  write(server ? { ...rest, server } : rest);
}

export function isRestorablePath(pathname: string): boolean {
  return RESTORABLE_PATH.test(pathname) && !pathname.includes("//");
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
