import { type ChildNode, type Element, isTag } from "domhandler";
import { DomUtils, parseDocument } from "htmlparser2";

export type Json = null | string | number | boolean | Json[] | { [key: string]: Json };

const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/gi;
export const MAX_TEXT_VALUE = 500;

const MAX_SOURCE_CHARS = 1024 * 1024;
const MAX_JSONLD_SOURCE = 2 * 1024 * 1024;
const MAX_STRUCTURED_BLOCKS = 10;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ITEMS = 20;
const MAX_JSON_KEYS = 40;
const MAX_JSON_STRING = 2000;

const STYLE_BLOCK = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const DATA_URI_ATTRIBUTE = /(["'])\s*data:[^"']*\1/gi;
const DATA_URI_CSS = /url\(\s*(["']?)\s*data:[^)]*\)/gi;
const BASE64_LINES =
  /(?:^[ \t]*[A-Za-z0-9+/]{60,}={0,2}[ \t]*(?:\r?\n|$)){3,}(?:[ \t]*(?:[A-Za-z0-9+/]{20,}={0,2}|[A-Za-z0-9+/]*[0-9+/][A-Za-z0-9+/]*={0,2}|[A-Za-z0-9+/]+={1,2})[ \t]*(?:\r?\n|$))?/gm;
const BASE64_RUN = /[A-Za-z0-9+/]{200,}={0,2}/g;

export function prepareHtml(html: string): string {
  return html
    .replace(STYLE_BLOCK, "")
    .replace(DATA_URI_ATTRIBUTE, "$1$1")
    .replace(DATA_URI_CSS, "url()")
    .slice(0, MAX_SOURCE_CHARS);
}

export function prepareText(text: string): string {
  return text.slice(0, MAX_SOURCE_CHARS).replace(BASE64_LINES, " ").replace(BASE64_RUN, " ");
}

function isJsonObject(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundJson(value: Json, depth = 0): Json {
  if (typeof value === "string") return value.slice(0, MAX_JSON_STRING);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_JSON_DEPTH) return null;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_JSON_ITEMS).map((item) => boundJson(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_JSON_KEYS)
      .map(([key, item]) => [key, boundJson(item, depth + 1)]),
  );
}

export interface MessageAnchor {
  text: string;
  href: string;
}

export interface MessageExtras {
  structuredData: Json[];
  links: string[];
  anchors: MessageAnchor[];
}

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseJsonLd(raw: string): Json[] {
  if (raw.length > MAX_JSONLD_SOURCE) return [];
  const cleaned = raw
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\/\s*<!\[CDATA\[/, "")
    .replace(/\/\/\s*\]\]>$/, "");
  try {
    const parsed: Json = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function itemTypeName(el: Element): string | null {
  const raw = DomUtils.getAttributeValue(el, "itemtype");
  if (!raw) return null;
  return raw
    .split(/\s+/)
    .map((t) => t.replace(/\/+$/, "").split("/").pop() ?? t)
    .join(" ");
}

function microdataValue(el: Element): Json {
  if (DomUtils.hasAttrib(el, "itemscope")) return microdataItem(el);
  const attr = (name: string) => DomUtils.getAttributeValue(el, name);
  switch (el.name) {
    case "meta":
      return attr("content") ?? "";
    case "a":
    case "area":
    case "link":
      return attr("href") ?? "";
    case "img":
    case "audio":
    case "video":
    case "source":
    case "iframe":
    case "embed":
      return attr("src") ?? "";
    case "object":
      return attr("data") ?? "";
    case "time":
      return attr("datetime") ?? collapse(DomUtils.textContent(el));
    case "data":
    case "meter":
      return attr("value") ?? "";
    default:
      return collapse(DomUtils.textContent(el)).slice(0, MAX_TEXT_VALUE);
  }
}

function collectProps(nodes: ChildNode[], out: Record<string, Json[]>): void {
  for (const node of nodes) {
    if (!isTag(node)) continue;
    const names = DomUtils.getAttributeValue(node, "itemprop");
    if (names) {
      const value = microdataValue(node);
      for (const name of names.split(/\s+/).filter(Boolean)) {
        out[name] ??= [];
        out[name].push(value);
      }
    }
    if (!DomUtils.hasAttrib(node, "itemscope")) {
      collectProps(node.children, out);
    }
  }
}

function microdataItem(el: Element): Json {
  const props: Record<string, Json[]> = {};
  collectProps(el.children, props);
  const item: Record<string, Json> = {};
  const type = itemTypeName(el);
  if (type) item["@type"] = type;
  for (const [name, values] of Object.entries(props)) {
    const [only] = values;
    item[name] = values.length === 1 && only !== undefined ? only : values;
  }
  return item;
}

function isTopLevelItem(el: Element): boolean {
  return DomUtils.hasAttrib(el, "itemscope") && !DomUtils.hasAttrib(el, "itemprop");
}

function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim().replace(/[.,;:!?]+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function linksInText(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const link = normalizeLink(match[0]);
    if (link) out.push(link);
  }
  return out;
}

export function extractMessageExtras(html: string | null, text: string | null): MessageExtras {
  const blocks: Json[] = [];
  const links = new Set<string>();
  const anchors = new Map<string, string>();

  if (html) {
    const doc = parseDocument(html);
    for (const script of DomUtils.getElementsByTagName("script", doc)) {
      const type = DomUtils.getAttributeValue(script, "type") ?? "";
      if (type.trim().toLowerCase() !== "application/ld+json") continue;
      blocks.push(...parseJsonLd(DomUtils.textContent(script)));
    }
    for (const el of DomUtils.findAll(isTopLevelItem, doc.children)) {
      blocks.push(microdataItem(el));
    }
    for (const a of DomUtils.getElementsByTagName("a", doc)) {
      const href = DomUtils.getAttributeValue(a, "href");
      const link = href ? normalizeLink(href) : null;
      if (!link) continue;
      links.add(link);
      const label = collapse(
        DomUtils.textContent(a) || (DomUtils.getAttributeValue(a, "title") ?? ""),
      ).slice(0, 80);
      if (label && !anchors.has(link)) anchors.set(link, label);
    }
  }
  const structuredData = blocks
    .filter(isJsonObject)
    .slice(0, MAX_STRUCTURED_BLOCKS)
    .map((block) => boundJson(block));
  for (const link of linksInText(text ?? "")) links.add(link);
  for (const link of linksInText(JSON.stringify(structuredData))) {
    links.add(link);
  }

  return {
    structuredData,
    links: [...links],
    anchors: [...anchors].map(([href, label]) => ({ text: label, href })),
  };
}
