export const SCHEME = "metis-suite";
export const USER_AGENT_TOKEN = "MetisSuite";
export const SETTINGS_PATH = "/native/settings";

export type DeepLink =
  | { kind: "auth"; code: string; state: string }
  | { kind: "open"; path: string };

export function safePath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${SCHEME}://`)) ?? null;
}

export function parseDeepLink(raw: string): DeepLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) return null;

  if (url.hostname === "auth") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return null;
    return { kind: "auth", code, state };
  }

  if (url.hostname === "open") {
    const path = safePath(url.searchParams.get("path"));
    return path ? { kind: "open", path } : null;
  }

  return null;
}
