import { format, parseISO } from "date-fns";

import type { SummaryCardProps } from "@/mail/summary-catalog";

type Money = NonNullable<SummaryCardProps<"Order">["total"]>;

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseWhen(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatWhen(value: string | null | undefined): string | null {
  const date = parseWhen(value);
  if (!date || !value) return null;
  return DATE_ONLY.test(value) ? format(date, "EEE, MMM d") : format(date, "EEE, MMM d · h:mm a");
}

export function formatRange(start: string, end: string | null): string | null {
  const from = formatWhen(start);
  if (!from) return null;
  const startDate = parseWhen(start);
  const endDate = parseWhen(end);
  if (!endDate || !startDate || DATE_ONLY.test(start)) return from;
  const sameDay = format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd");
  return `${from} – ${sameDay ? format(endDate, "h:mm a") : formatWhen(end)}`;
}

export function formatMoney(money: Money | null | undefined): string | null {
  if (!money) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: money.currency,
    }).format(money.amount);
  } catch {
    return `${money.amount} ${money.currency}`;
  }
}

export function directionsUrl(place: string | null | undefined): string | null {
  const query = place?.trim();
  if (!query || /^https?:\/\//i.test(query)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function humanize(value: string): string {
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
