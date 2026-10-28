import { SETTINGS_PATH } from "./links";

const SIGN_IN_PATHS = new Set([
  "/",
  "/2fa/verify",
  "/setup",
  "/forgot-password",
  "/reset-password",
]);
const BROWSER_ONLY_PREFIXES = ["/invite/", "/oauth/", "/native/"];
const CONNECT_PREFIX = "/api/connections/start/";
const DOWNLOAD_PATH = "/api/drive/download";
const BROWSER_SESSION_HOSTS = [/(^|\.)google\.com$/, /(^|\.)googleusercontent\.com$/];

export const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

export const SLOW_LOAD_MS = 15_000;

export type Decision = "allow" | "sign-in" | "connect" | "settings" | "external";

export function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function decide(url: URL, server: string | null): Decision {
  if (!server || url.origin !== server) return "external";
  if (SIGN_IN_PATHS.has(url.pathname)) return "sign-in";
  if (url.pathname.startsWith(CONNECT_PREFIX)) return "connect";
  if (url.pathname === SETTINGS_PATH) return "settings";
  if (BROWSER_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return "external";
  }
  return "allow";
}

export function isDownload(url: URL, server: string | null): boolean {
  return url.origin === server && url.pathname === DOWNLOAD_PATH;
}

export function needsBrowserSession(url: URL): boolean {
  return BROWSER_SESSION_HOSTS.some((host) => host.test(url.hostname));
}
