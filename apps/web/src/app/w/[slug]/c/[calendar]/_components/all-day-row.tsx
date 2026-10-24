"use client";

import { cn } from "@metis/ui/lib/utils";
import { differenceInDays, isSameDay } from "date-fns";

import { eventEnd, eventStart, monthEventPositions } from "@/calendar/layout";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "./calendar-context";
import { useEventColor } from "./event-colors";

const ROWS = 3;

export function AllDayRow({ days, events }: { days: Date[]; events: CalendarEvent[] }) {
  const { setSelected } = useCalendar();
  const colorFor = useEventColor();

  const firstDay = days[0];
  if (events.length === 0 || !firstDay) return null;

  const positions = monthEventPositions(events, firstDay, ROWS);
  const rows = Math.min(ROWS, Math.max(1, ...Object.values(positions).map((row) => row + 1)));

  return (
    <div className="flex shrink-0 border-b border-border">
      <div className="flex w-16 shrink-0 items-start justify-end pt-1.5 pr-2">
        <span className="text-[10px] text-faint">All day</span>
      </div>
      <div className="relative flex-1 border-l border-border" style={{ height: rows * 22 + 8 }}>
        {events.map((event) => {
          const start = eventStart(event);
          const end = eventEnd(event);
          const firstIndex = days.findIndex((day) => isSameDay(day, start));
          const lastIndex = days.findIndex((day) => isSameDay(day, end));
          const startIndex = firstIndex === -1 ? 0 : firstIndex;
          const endIndex = lastIndex === -1 ? days.length - 1 : lastIndex;
          const row = positions[event.id] ?? 0;
          if (row >= ROWS) return null;

          const spans = endIndex - startIndex + 1;
          const width = (spans / days.length) * 100;
          const left = (startIndex / days.length) * 100;

          return (
            <button
              key={`${event.accountId}:${event.id}`}
              type="button"
              onClick={() => setSelected(event)}
              style={{
                top: row * 22 + 4,
                left: `${left}%`,
                width: `calc(${width}% - 4px)`,
                backgroundColor: colorFor(event),
              }}
              className={cn(
                "absolute mx-0.5 h-[18px] truncate rounded-[4px] px-1.5 text-left text-[11px] font-medium leading-[18px] text-white/95",
                "transition-[filter] hover:brightness-110",
                differenceInDays(end, start) > 0 && "rounded-[4px]",
              )}
            >
              {event.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
