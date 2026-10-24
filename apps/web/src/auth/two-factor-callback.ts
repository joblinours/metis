export const TWO_FACTOR_CALLBACK_COOKIE = "metis-2fa-callback";
export const TWO_FACTOR_CALLBACK_MAX_AGE = 600;
const DEFAULT_TWO_FACTOR_CALLBACK = "/w";

export function sanitizeCallbackPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

export function toCallbackPath(raw: string | null | undefined, baseURL: string): string | null {
  if (!raw) return null;
  try {
    const resolved = new URL(raw, baseURL);
    if (resolved.origin !== new URL(baseURL).origin) return null;
    return sanitizeCallbackPath(`${resolved.pathname}${resolved.search}${resolved.hash}`);
  } catch {
    return null;
  }
}

export function rememberTwoFactorCallback(path: string): void {
  if (typeof document === "undefined") return;
  const target = sanitizeCallbackPath(path);
  if (!target) return;
  // oxlint-disable-next-line unicorn/no-document-cookie --Cookie Store API lacks Safari support
  document.cookie = `${TWO_FACTOR_CALLBACK_COOKIE}=${encodeURIComponent(target)}; Max-Age=${TWO_FACTOR_CALLBACK_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function consumeTwoFactorCallback(): string {
  if (typeof document === "undefined") return DEFAULT_TWO_FACTOR_CALLBACK;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${TWO_FACTOR_CALLBACK_COOKIE}=`));

  // oxlint-disable-next-line unicorn/no-document-cookie --Cookie Store API lacks Safari support
  document.cookie = `${TWO_FACTOR_CALLBACK_COOKIE}=; Max-Age=0; Path=/`;

  if (!match) return DEFAULT_TWO_FACTOR_CALLBACK;

  const raw = match.slice(TWO_FACTOR_CALLBACK_COOKIE.length + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_TWO_FACTOR_CALLBACK;
  }

  return sanitizeCallbackPath(decoded) ?? DEFAULT_TWO_FACTOR_CALLBACK;
}
