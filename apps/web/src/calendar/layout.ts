import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";

import type { CalendarEvent } from "@/types/calendar";

export const CALENDAR_VIEWS = ["day", "week", "month", "year", "schedule"] as const;
export type CalendarViewKey = (typeof CALENDAR_VIEWS)[number];

export function isCalendarView(value: string): value is CalendarViewKey {
  return (CALENDAR_VIEWS as readonly string[]).includes(value);
}

export interface VisibleHours {
  from: number;
  to: number;
}

export interface CalendarCell {
  day: number;
  currentMonth: boolean;
  date: Date;
}

export function eventStart(event: CalendarEvent): Date {
  return event.allDay ? startOfDay(parseISO(event.start.slice(0, 10))) : parseISO(event.start);
}

export function eventEnd(event: CalendarEvent): Date {
  if (!event.allDay) return parseISO(event.end);
  return startOfDay(subDays(parseISO(event.end.slice(0, 10)), 1));
}

export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function viewerOffsetLabel(at: Date = new Date()): string {
  const minutes = -at.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `GMT${sign}${hh}:${mm}`;
}

export function rangeLabel(view: CalendarViewKey, date: Date): string {
  switch (view) {
    case "day":
      return format(date, "MMMM yyyy");
    case "week": {
      const start = startOfWeek(date);
      const end = endOfWeek(date);
      if (isSameMonth(start, end)) return format(start, "MMMM yyyy");
      return `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`;
    }
    case "month":
      return format(date, "MMMM yyyy");
    case "year":
      return format(date, "yyyy");
    case "schedule": {
      const start = startOfMonth(date);
      const end = endOfMonth(addMonths(date, 1));
      return `${format(start, "MMM")} – ${format(end, "MMM yyyy")}`;
    }
  }
}

export function navigateDate(
  date: Date,
  view: CalendarViewKey,
  direction: "previous" | "next",
): Date {
  const next = direction === "next";
  switch (view) {
    case "day":
      return next ? addDays(date, 1) : subDays(date, 1);
    case "week":
      return next ? addWeeks(date, 1) : subWeeks(date, 1);
    case "month":
    case "schedule":
      return next ? addMonths(date, 1) : subMonths(date, 1);
    case "year":
      return next ? addYears(date, 1) : subYears(date, 1);
  }
}

function dayAfter(lastMoment: Date): Date {
  return startOfDay(addDays(lastMoment, 1));
}

export function viewRange(view: CalendarViewKey, date: Date): { start: Date; end: Date } {
  switch (view) {
    case "day":
      return { start: startOfDay(date), end: addDays(startOfDay(date), 1) };
    case "week":
      return { start: startOfWeek(date), end: dayAfter(endOfWeek(date)) };
    case "month":
      return {
        start: startOfWeek(startOfMonth(date)),
        end: dayAfter(endOfWeek(endOfMonth(date))),
      };
    case "year":
      return { start: startOfYear(date), end: dayAfter(endOfYear(date)) };
    case "schedule":
      return {
        start: startOfMonth(date),
        end: dayAfter(endOfMonth(addMonths(date, 1))),
      };
  }
}

function isMultiDay(event: CalendarEvent): boolean {
  return !isSameDay(eventStart(event), eventEnd(event));
}

export function splitEvents(events: CalendarEvent[]): {
  banded: CalendarEvent[];
  timed: CalendarEvent[];
} {
  const banded: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const event of events) {
    if (event.allDay || isMultiDay(event)) banded.push(event);
    else timed.push(event);
  }
  return { banded, timed };
}

export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const from = startOfDay(day);
  const to = addDays(from, 1);
  return events.filter((event) => {
    const start = eventStart(event);
    const end = eventEnd(event);
    return start < to && end >= from;
  });
}

export function groupOverlapping(dayEvents: CalendarEvent[]): CalendarEvent[][] {
  const sorted = dayEvents.toSorted((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
  const groups: CalendarEvent[][] = [];

  for (const event of sorted) {
    const start = eventStart(event);
    let placed = false;
    for (const group of groups) {
      const last = group[group.length - 1];
      if (last && start >= eventEnd(last)) {
        group.push(event);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([event]);
  }

  return groups;
}

export type BlockStyle = {
  top: string;
  height: string;
  left: string;
  width: string;
};

export function eventBlockStyle(
  event: CalendarEvent,
  day: Date,
  groupIndex: number,
  groupSize: number,
  visibleHours?: VisibleHours,
): BlockStyle {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  const rawStart = eventStart(event);
  const rawEnd = eventEnd(event);
  const start = rawStart < dayStart ? dayStart : rawStart;
  const end = rawEnd > dayEnd ? dayEnd : rawEnd;

  const fromMinutes = (visibleHours?.from ?? 0) * 60;
  const toMinutes = (visibleHours?.to ?? 24) * 60;
  const span = Math.max(toMinutes - fromMinutes, 1);

  const startMinutes = differenceInMinutes(start, dayStart);
  const durationMinutes = Math.max(differenceInMinutes(end, start), 15);

  const top = ((startMinutes - fromMinutes) / span) * 100;
  const height = (durationMinutes / span) * 100;
  const width = 100 / Math.max(groupSize, 1);

  return {
    top: `${top}%`,
    height: `${height}%`,
    left: `${groupIndex * width}%`,
    width: `${width}%`,
  };
}

export function visibleHourRange(
  preferred: VisibleHours,
  timedEvents: CalendarEvent[],
): { hours: number[]; from: number; to: number } {
  let from = preferred.from;
  let to = preferred.to;

  for (const event of timedEvents) {
    const start = eventStart(event);
    const end = eventEnd(event);
    const startHour = start.getHours();
    const endHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
    if (startHour < from) from = startHour;
    if (endHour > to) to = endHour;
  }

  from = Math.max(0, Math.min(from, 23));
  to = Math.min(24, Math.max(to, from + 1));

  return {
    hours: Array.from({ length: to - from }, (_, i) => i + from),
    from,
    to,
  };
}

export function monthCells(selectedDate: Date): CalendarCell[] {
  const start = startOfWeek(startOfMonth(selectedDate));
  const end = endOfWeek(endOfMonth(selectedDate));
  return eachDayOfInterval({ start, end }).map((date) => ({
    day: date.getDate(),
    currentMonth: isSameMonth(date, selectedDate),
    date,
  }));
}

export function monthEventPositions(
  events: CalendarEvent[],
  selectedDate: Date,
  rows: number,
): Record<string, number> {
  const start = startOfWeek(startOfMonth(selectedDate));
  const end = endOfWeek(endOfMonth(selectedDate));

  const positions: Record<string, number> = {};
  const occupied: Record<string, boolean[]> = {};
  for (const day of eachDayOfInterval({ start, end })) {
    occupied[startOfDay(day).toISOString()] = Array.from({ length: rows }, () => false);
  }

  const { banded, timed } = splitEvents(events);
  const sorted = [
    ...banded.toSorted((a, b) => {
      const aSpan = differenceInDays(eventEnd(a), eventStart(a));
      const bSpan = differenceInDays(eventEnd(b), eventStart(b));
      return bSpan - aSpan || eventStart(a).getTime() - eventStart(b).getTime();
    }),
    ...timed.toSorted((a, b) => eventStart(a).getTime() - eventStart(b).getTime()),
  ];

  for (const event of sorted) {
    const rawStart = eventStart(event);
    const rawEnd = eventEnd(event);
    if (rawEnd < start || rawStart > end) continue;

    const days = eachDayOfInterval({
      start: rawStart < start ? start : rawStart,
      end: rawEnd > end ? end : rawEnd,
    });

    for (let row = 0; row < rows; row++) {
      const free = days.every((day) => occupied[startOfDay(day).toISOString()]?.[row] === false);
      if (!free) continue;
      for (const day of days) {
        const slot = occupied[startOfDay(day).toISOString()];
        if (slot) slot[row] = true;
      }
      positions[event.id] = row;
      break;
    }
  }

  return positions;
}

export interface PlacedEvent {
  event: CalendarEvent;
  position: number;
  multiDay: boolean;
  startsHere: boolean;
  endsHere: boolean;
}

export function monthCellEvents(
  date: Date,
  events: CalendarEvent[],
  positions: Record<string, number>,
): PlacedEvent[] {
  return eventsForDay(events, date)
    .map((event) => ({
      event,
      position: positions[event.id] ?? -1,
      multiDay: isMultiDay(event) || event.allDay,
      startsHere: isSameDay(date, eventStart(event)),
      endsHere: isSameDay(date, eventEnd(event)),
    }))
    .toSorted((a, b) => {
      if (a.multiDay !== b.multiDay) return a.multiDay ? -1 : 1;
      if (a.position !== b.position) return a.position - b.position;
      return eventStart(a.event).getTime() - eventStart(b.event).getTime();
    });
}

export interface ScheduleGroup {
  date: Date;
  events: CalendarEvent[];
}

export function scheduleGroups(
  events: CalendarEvent[],
  range: { start: Date; end: Date },
): ScheduleGroup[] {
  const days = eachDayOfInterval({
    start: startOfDay(range.start),
    end: subDays(range.end, 1),
  });
  return days
    .map((date) => ({
      date,
      events: eventsForDay(events, date).toSorted((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return eventStart(a).getTime() - eventStart(b).getTime();
      }),
    }))
    .filter((group) => group.events.length > 0);
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = eventStart(event);
  const end = eventEnd(event);
  const startLabel = format(start, start.getMinutes() === 0 ? "ha" : "h:mma");
  const endLabel = format(end, end.getMinutes() === 0 ? "ha" : "h:mma");
  return `${startLabel.toLowerCase()} – ${endLabel.toLowerCase()}`;
}

export function formatEventStartTime(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = eventStart(event);
  return format(start, start.getMinutes() === 0 ? "ha" : "h:mma").toLowerCase();
}

export function isPast(event: CalendarEvent, now: Date = new Date()): boolean {
  return eventEnd(event) < now;
}
