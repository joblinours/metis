import { z } from "zod";

export const pendingLoginSchema = z.object({
  server: z.string(),
  state: z.string(),
  verifier: z.string(),
  expiresAt: z.number(),
});
export type PendingLogin = z.infer<typeof pendingLoginSchema>;

export const storedSchema = z.object({
  server: z.string().optional().catch(undefined),
  pendingLogin: pendingLoginSchema.optional().catch(undefined),
  settings: z.unknown().optional(),
  lastPath: z.string().optional().catch(undefined),
});
export type Stored = z.infer<typeof storedSchema>;

const RESTORABLE_PATH = /^\/w\/[^/?#\\]+(\/[^?#\\]*)?(\?[^#\\]*)?$/;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseStored(input: unknown): Stored {
  return storedSchema.catch({}).parse(input);
}

export function normalizeServer(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
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

export function isRestorablePath(pathname: string): boolean {
  return RESTORABLE_PATH.test(pathname) && !pathname.includes("//");
}
