export type UrlMapper = (url: string) => string | null;

export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

export function parseSrcset(value: string): SrcsetCandidate[] {
  const out: SrcsetCandidate[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i] ?? "")) i++;
    if (i >= value.length) break;
    let url = "";
    while (i < value.length && !/\s/.test(value[i] ?? "")) url += value[i++];
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      let depth = 0;
      while (i < value.length) {
        const c = value[i] ?? "";
        if (c === "(") depth++;
        else if (c === ")") depth = Math.max(0, depth - 1);
        else if (c === "," && depth === 0) break;
        descriptor += c;
        i++;
      }
      i++;
    }
    if (url) out.push({ url, descriptor: descriptor.trim() });
  }
  return out;
}

export function serializeSrcset(candidates: SrcsetCandidate[]): string {
  return candidates.map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url)).join(", ");
}

const CSS_URL = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)"'\s]*))\s*\)/gi;
const IMAGE_SET = /(?:-webkit-)?image-set\(/gi;
const CSS_STRING = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
const CSS_IMPORT = /@import\s+[^;]*;?/gi;

function unescapeCss(value: string): string {
  return value.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : ch,
  );
}

function quoteCss(url: string): string {
  return `"${url.replace(/["\\\n]/g, (c) => `\\${c === "\n" ? "a " : c}`)}"`;
}

function mapImageSets(css: string, map: UrlMapper): string {
  let out = "";
  let last = 0;
  IMAGE_SET.lastIndex = 0;
  for (let m = IMAGE_SET.exec(css); m; m = IMAGE_SET.exec(css)) {
    const start = m.index + m[0].length;
    let depth = 1;
    let end = start;
    while (end < css.length && depth > 0) {
      if (css[end] === "(") depth++;
      else if (css[end] === ")") depth--;
      end++;
    }
    const inner = css.slice(start, depth === 0 ? end - 1 : end);
    const mapped = inner.replace(CSS_STRING, (whole, dq, sq, offset) => {
      if (/url\(\s*$/i.test(inner.slice(0, offset))) return whole;
      const url = unescapeCss(dq ?? sq ?? "");
      const next = map(url);
      return next === null ? "none" : next === url ? whole : quoteCss(next);
    });
    out += css.slice(last, start) + mapped;
    last = depth === 0 ? end - 1 : end;
    IMAGE_SET.lastIndex = Math.max(end, IMAGE_SET.lastIndex);
  }
  return out + css.slice(last);
}

export function mapCssUrls(css: string, map: UrlMapper): string {
  const withUrls = css.replace(CSS_URL, (whole, dq, sq, bare) => {
    const url = unescapeCss((dq ?? sq ?? bare ?? "").trim());
    if (!url) return whole;
    const next = map(url);
    if (next === null) return "none";
    return next === url ? whole : `url(${quoteCss(next)})`;
  });
  return mapImageSets(withUrls, map);
}

export function stripCssImports(css: string): string {
  return css.replace(CSS_IMPORT, "");
}

const FONT_FACE = /@font-face\s*\{[^}]*\}/gi;
const UNCLOSED_URL = /url\(\s*(?!["']?\s*(?:#|data:))[^)]*$/i;

export function stripRemoteFonts(css: string): string {
  return css.replace(FONT_FACE, (block) =>
    mapCssUrls(block, (url) => (isInlineUrl(url) ? url : null)),
  );
}

export function stripUnclosedUrl(css: string): string {
  const match = UNCLOSED_URL.exec(css);
  return match ? css.slice(0, match.index) : css;
}

const COLOR_SCHEME_QUERY = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi;
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

export function pinColorScheme(css: string, theme: "light" | "dark"): string {
  return css.replace(COLOR_SCHEME_QUERY, (_, scheme: string) =>
    scheme.toLowerCase() === theme ? ALWAYS : NEVER,
  );
}

export function isRemoteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url.trim());
}

export function isInlineUrl(url: string): boolean {
  return /^(?:data|cid|blob):/i.test(url.trim());
}

export function absoluteRemote(url: string): URL | null {
  const trimmed = url.trim();
  if (!isRemoteUrl(trimmed)) return null;
  try {
    const parsed = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}
