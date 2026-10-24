"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useNow } from "@/hooks/use-now";
import { useWorkspaceScope } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { SummaryCardProps } from "@/mail/summary-catalog";
import type { CalendarEventDto } from "@/server/schema";
import { ALL_CALENDARS_SLUG } from "@/workspace/path";

import { DATE_ONLY, parseWhen } from "./format";

const MINUTE = 60_000;
const DEFAULT_LENGTH = 60 * MINUTE;

export interface CalendarMatch {
  event: CalendarEventDto | null;
  conflicts: CalendarEventDto[];
}

function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameTitle(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

export function useCalendarMatch(props: SummaryCardProps<"Meeting">): CalendarMatch | null {
  const scope = useWorkspaceScope();
  const now = useNow();
  const start = parseWhen(props.start);
  const timed = !props.allDay && !DATE_ONLY.test(props.start);
  const startMs = start?.getTime() ?? null;
  const endMs =
    parseWhen(props.end)?.getTime() ?? (startMs !== null ? startMs + DEFAULT_LENGTH : null);
  const upcoming = timed && props.status !== "cancelled" && endMs !== null && endMs > now.getTime();
  const query = useQuery(
    rpc.calendarEvents.list.queryOptions({
      input:
        upcoming && startMs !== null && endMs !== null
          ? {
              ...scope,
              calendarSlug: ALL_CALENDARS_SLUG,
              timeMin: new Date(startMs - MINUTE).toISOString(),
              timeMax: new Date(endMs + MINUTE).toISOString(),
            }
          : skipToken,
    }),
  );
  const events = query.data?.events;

  const match = useMemo((): CalendarMatch | null => {
    if (!upcoming || !events || startMs === null || endMs === null) return null;
    const live = events.filter((e) => !e.allDay && e.status !== "cancelled");
    const event =
      live.find(
        (e) =>
          Math.abs(new Date(e.start).getTime() - startMs) < MINUTE &&
          sameTitle(e.title, props.title),
      ) ?? null;
    const conflicts = live.filter(
      (e) =>
        e !== event &&
        e.myResponse !== "declined" &&
        new Date(e.start).getTime() < endMs &&
        new Date(e.end).getTime() > startMs,
    );
    return { event, conflicts };
  }, [upcoming, events, startMs, endMs, props.title]);

  return match;
}
