import { safeRequest } from "@/lib/ssrf";
import type { UnsubscribeInfo, UnsubscribeMethod } from "@/types/mail";

export interface ParsedUnsubscribe {
  oneClickUrl?: string;
  mailtoUrl?: string;
  linkUrl?: string;
}

export function extractEmailAddress(from: string): string {
  const angled = from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1];
  if (angled) return angled.toLowerCase();
  const bare = from.trim().replace(/^"|"$/g, "");
  return bare.includes("@") ? bare.toLowerCase() : "";
}

export function parseUnsubscribeHeader(info: UnsubscribeInfo): ParsedUnsubscribe {
  let entries = info.listUnsubscribe.match(/<([^>]+)>/g)?.map((s) => s.slice(1, -1).trim()) ?? [];
  if (entries.length === 0) {
    entries = info.listUnsubscribe
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const httpsUrl = entries.find((e) => /^https:\/\//i.test(e));
  const anyHttpUrl = entries.find((e) => /^https?:\/\//i.test(e));
  const mailtoUrl = entries.find((e) => /^mailto:/i.test(e));
  const oneClick = !!httpsUrl && /list-unsubscribe=one-click/i.test(info.listUnsubscribePost ?? "");

  return {
    oneClickUrl: oneClick ? httpsUrl : undefined,
    mailtoUrl,
    linkUrl: anyHttpUrl,
  };
}

export function unsubscribeMethods(parsed: ParsedUnsubscribe): UnsubscribeMethod[] {
  const methods: UnsubscribeMethod[] = [];
  if (parsed.oneClickUrl) methods.push("one_click");
  if (parsed.mailtoUrl) methods.push("mailto");
  if (parsed.linkUrl) methods.push("link");
  return methods;
}

function isSafeUnsubscribeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (host.startsWith("[")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  return true;
}

export async function performOneClickUnsubscribe(url: string): Promise<void> {
  if (!isSafeUnsubscribeUrl(url)) {
    throw new Error("Unsubscribe URL failed safety checks");
  }
  const res = await safeRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
    protocols: ["https:"],
    timeoutMs: 10_000,
  });
  await res.close();
  if (res.status >= 400) {
    throw new Error(`Unsubscribe endpoint returned ${res.status}`);
  }
}

export function parseMailtoUnsubscribe(
  raw: string,
): { to: string; subject: string; body: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "mailto:") return null;
  let to = url.pathname;
  try {
    to = decodeURIComponent(to);
  } catch {}
  // oxlint-disable-next-line typescript/no-non-null-assertion --split always yields one element
  to = to.split(",")[0]!.trim();
  if (!to.includes("@")) return null;
  return {
    to,
    subject: url.searchParams.get("subject") || "Unsubscribe",
    body: url.searchParams.get("body") || "unsubscribe",
  };
}
