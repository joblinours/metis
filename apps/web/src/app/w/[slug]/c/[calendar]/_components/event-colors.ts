"use client";

import { useCallback } from "react";

import { fnv1a } from "@/lib/utils";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";

const FALLBACK_COLORS = [
  "#5ba3d4",
  "#27ae60",
  "#b07ed4",
  "#e67e22",
  "#3aa6a6",
  "#6c7fd8",
  "#e74c3c",
  "#c8922a",
];

export function calendarColor(calendarId: string, providerColor?: string | null): string {
  if (providerColor && /^#[0-9a-fA-F]{6}$/.test(providerColor)) {
    return providerColor;
  }
  return (
    // oxlint-disable-next-line typescript/no-non-null-assertion --It is guaranteed to be in the array
    FALLBACK_COLORS[fnv1a(calendarId) % FALLBACK_COLORS.length]!
  );
}

export function useEventColor(): (event: CalendarEvent) => string {
  const { calendars } = useCalendar();
  return useCallback(
    (event: CalendarEvent) => {
      const source = calendars.find(
        (c) => c.id === event.calendarId && c.accountId === event.accountId,
      );
      return calendarColor(event.calendarId, source?.color);
    },
    [calendars],
  );
}
