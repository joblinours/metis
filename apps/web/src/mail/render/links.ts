import { requiredLiteral } from "./literal-hint";
import type { ClearUrlsProvider } from "./types";

interface CompiledProvider {
  name: string;
  hint: string | null;
  pattern: RegExp;
  completeProvider: boolean;
  rules: readonly RegExp[];
  rawRules: readonly RegExp[];
  exceptions: readonly RegExp[];
  redirections: readonly RegExp[];
}

export interface LinkRules {
  providers: readonly CompiledProvider[];
}

export interface CleanedLink {
  href: string;
  changed: boolean;
  unwrapped: boolean;
  wrappedBy: string | null;
}

const MAX_UNWRAP = 5;

export function compileLinkRules(providers: readonly ClearUrlsProvider[]): LinkRules {
  return {
    providers: providers.map((p) => ({
      name: p.name,
      hint: requiredLiteral(p.urlPattern),
      pattern: new RegExp(p.urlPattern, "i"),
      completeProvider: p.completeProvider,
      rules: [...p.rules, ...p.referralMarketing].map((r) => new RegExp(`^${r}$`, "i")),
      rawRules: p.rawRules.map((r) => new RegExp(r, "gi")),
      exceptions: p.exceptions.map((r) => new RegExp(r, "i")),
      redirections: p.redirections.map((r) => new RegExp(r, "i")),
    })),
  };
}

function parseHttp(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function decodeTarget(raw: string): URL | null {
  let value = raw;
  for (let i = 0; i < 3; i++) {
    const direct = parseHttp(value);
    if (direct) return direct;
    try {
      const next = decodeURIComponent(value);
      if (next === value) break;
      value = next;
    } catch {
      break;
    }
  }
  return parseHttp(value);
}

function matching(url: string, rules: LinkRules): CompiledProvider[] {
  const lower = url.toLowerCase();
  return rules.providers.filter(
    (p) =>
      (p.hint === null || lower.includes(p.hint)) &&
      p.pattern.test(url) &&
      !p.exceptions.some((e) => e.test(url)),
  );
}

function unwrapOnce(url: URL, rules: LinkRules): { next: URL } | { wrappedBy: string } | null {
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".safelinks.protection.outlook.com")) {
    const target = url.searchParams.get("url");
    const next = target ? decodeTarget(target) : null;
    return next ? { next } : null;
  }
  if (host === "urldefense.proofpoint.com" && url.pathname.startsWith("/v2/url")) {
    const encoded = url.searchParams.get("u");
    if (!encoded) return null;
    try {
      const next = parseHttp(decodeURIComponent(encoded.replace(/-/g, "%").replace(/_/g, "/")));
      return next ? { next } : null;
    } catch {
      return null;
    }
  }
  if (host === "urldefense.com" && url.pathname.startsWith("/v3/__")) {
    return { wrappedBy: "Proofpoint" };
  }
  const href = url.href;
  for (const provider of matching(href, rules)) {
    for (const redirection of provider.redirections) {
      const target = href.match(redirection)?.[1];
      const next = target ? decodeTarget(target) : null;
      if (next) return { next };
    }
  }
  return null;
}

function stripParams(params: URLSearchParams, rules: readonly RegExp[]) {
  let changed = false;
  for (const key of Array.from(params.keys())) {
    if (rules.some((r) => r.test(key))) {
      params.delete(key);
      changed = true;
    }
  }
  return changed;
}

function cleanParams(url: URL, rules: LinkRules): { url: URL; changed: boolean } {
  let href = url.href;
  let changed = false;
  for (const provider of matching(href, rules)) {
    if (provider.completeProvider) continue;
    for (const raw of provider.rawRules) {
      const next = href.replace(raw, "");
      if (next !== href) {
        href = next;
        changed = true;
      }
    }
    const current = parseHttp(href);
    if (!current) break;
    if (stripParams(current.searchParams, provider.rules)) changed = true;
    const fragment = current.hash.slice(1);
    if (fragment.includes("=")) {
      const params = new URLSearchParams(fragment);
      if (stripParams(params, provider.rules)) {
        current.hash = params.toString();
        changed = true;
      }
    }
    href = current.href;
  }
  const final = parseHttp(href.replace("?&", "?").replace("#&", "#")) ?? url;
  return { url: final, changed };
}

export function cleanLink(raw: string, rules: LinkRules): CleanedLink {
  let url = parseHttp(raw);
  if (!url) return { href: raw, changed: false, unwrapped: false, wrappedBy: null };
  let unwrapped = false;
  let wrappedBy: string | null = null;
  for (let i = 0; i < MAX_UNWRAP; i++) {
    const step = unwrapOnce(url, rules);
    if (!step) break;
    if ("wrappedBy" in step) {
      wrappedBy = step.wrappedBy;
      break;
    }
    url = step.next;
    unwrapped = true;
  }
  const cleaned = wrappedBy ? { url, changed: false } : cleanParams(url, rules);
  const href = cleaned.url.href;
  return {
    href: unwrapped || cleaned.changed ? href : raw,
    changed: unwrapped || cleaned.changed,
    unwrapped,
    wrappedBy,
  };
}
