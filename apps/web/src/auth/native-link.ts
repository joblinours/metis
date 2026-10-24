export const NATIVE_SCHEME = "metis-suite";
export const NATIVE_USER_AGENT_TOKEN = "MetisSuite";
export const NATIVE_SETTINGS_PATH = "/native/settings";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isNativeToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function isNativeChallenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_PATTERN.test(value);
}

export function isNativeUserAgent(userAgent: string): boolean {
  return new RegExp(`\\b${NATIVE_USER_AGENT_TOKEN}/`).test(userAgent);
}

export function isNativeLink(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${NATIVE_SCHEME}://`);
}

export function nativeAuthLink(code: string, state: string): string {
  const params = new URLSearchParams({ code, state });
  return `${NATIVE_SCHEME}://auth?${params.toString()}`;
}

export function nativeOpenLink(path: string): string {
  const params = new URLSearchParams({ path });
  return `${NATIVE_SCHEME}://open?${params.toString()}`;
}

export function nativeReturnPath(link: string): string {
  const params = new URLSearchParams({ to: link });
  return `/native/return?${params.toString()}`;
}

export function nativeLoginPath(challenge: string, state: string): string {
  const params = new URLSearchParams({ challenge, state });
  return `/native/login?${params.toString()}`;
}
