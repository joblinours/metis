import { format, formatDistanceToNow, isThisYear, isToday, isYesterday } from "date-fns";

export function formatEmailDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "MMM d");
  return format(date, "MM/dd/yy");
}

export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}…`;
}

const BYTE_UNITS = ["KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
}

export function fnv1a(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function orderByIds<T extends { id: string }>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of items) {
    if (byId.has(item.id)) ordered.push(item);
  }
  return ordered;
}

const QUOTE_BOUNDARY = [
  /^On .+ wrote:$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^_{5,}$/,
  /^From:\s.+\bSent:\s/i,
];

export function stripQuotedText(text: string): string {
  if (!text) return "";
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (QUOTE_BOUNDARY.some((re) => re.test(trimmed))) break;
    if (trimmed.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

import type { Email, ThreadGroup } from "@/types/mail";

export function groupByThread(emails: Email[]): ThreadGroup[] {
  const groups = new Map<string, ThreadGroup>();
  for (const email of emails) {
    const key = email.threadId ?? email.id;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.ids.push(email.id);
      existing.hasUnread = existing.hasUnread || !email.isRead;
      existing.hasStarred = existing.hasStarred || email.isStarred;
    } else {
      groups.set(key, {
        threadId: key,
        latest: email,
        count: 1,
        hasUnread: !email.isRead,
        hasStarred: email.isStarred,
        ids: [email.id],
      });
    }
  }
  return Array.from(groups.values());
}
