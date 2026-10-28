import { z } from "zod";

export const DOWNLOADS_ORIGIN = "https://downloads.trymetis.email";
export const DOWNLOAD_PAGE = "https://docs.trymetis.email/guide/apps/download";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type ShellApp = "desktop" | "mobile";

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const versionSchema = z.string().trim().regex(VERSION);

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "current"; checkedAt: number }
  | { state: "available"; version: string; checkedAt: number }
  | { state: "failed"; checkedAt: number };

export function manifestUrl(app: ShellApp): string {
  return `${DOWNLOADS_ORIGIN}/${app}/latest/version.txt`;
}

export function latestFileUrl(app: ShellApp, file: string): string {
  return `${DOWNLOADS_ORIGIN}/${app}/latest/${file}`;
}

function parts(version: string): { core: [number, number, number]; pre: string | null } | null {
  const match = VERSION.exec(version.trim());
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ?? null,
  };
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parts(candidate);
  const now = parts(current);
  if (!next || !now) return false;
  for (let index = 0; index < 3; index++) {
    const a = next.core[index] ?? 0;
    const b = now.core[index] ?? 0;
    if (a !== b) return a > b;
  }
  return next.pre === null && now.pre !== null;
}

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export async function fetchLatestVersion(app: ShellApp, fetcher: Fetcher = fetch): Promise<string> {
  const response = await fetcher(manifestUrl(app), { headers: { Accept: "text/plain" } });
  if (!response.ok) throw new Error(`version file answered ${response.status}`);
  return versionSchema.parse(await response.text());
}
