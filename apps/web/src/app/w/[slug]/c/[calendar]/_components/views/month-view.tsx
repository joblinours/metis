"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@metis/ui/lib/utils";
import { format, isToday, startOfDay } from "date-fns";
import { useMemo } from "react";

import {
  formatEventStartTime,
  isPast,
  monthCellEvents,
  monthCells,
  monthEventPositions,
} from "@/calendar/layout";
import type { CalendarEvent } from "@/types/calendar";

import { useCalendar } from "../calendar-context";
import { useEventColor } from "../event-colors";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_ROWS = 3;

function DayCell({
  date,
  currentMonth,
  events,
  positions,
}: {
  date: Date;
  currentMonth: boolean;
  events: CalendarEvent[];
  positions: Record<string, number>;
}) {
  const { setSelected, setDraft, setDate, setView } = useCalendar();
  const colorFor = useEventColor();
  const { setNodeRef, isOver } = useDroppable({
    id: date.toISOString(),
    data: { day: date, allDay: true },
  });

  const placed = monthCellEvents(date, events, positions);
  const shown = placed.filter((p) => p.position > -1 && p.position < VISIBLE_ROWS);
  const hidden = placed.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-28 flex-col border-r border-b border-border-soft last:border-r-0",
        !currentMonth && "bg-panel/40",
        isOver && "bg-brand-soft/30",
      )}
    >
      <button
        type="button"
        onClick={() => {
          setDate(date);
          setView("day");
        }}
        className="flex justify-center pt-1"
      >
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px]",
            isToday(date)
              ? "bg-primary font-medium text-primary-foreground"
              : currentMonth
                ? "text-foreground hover:bg-hover"
                : "text-faint hover:bg-hover",
          )}
        >
          {format(date, "d")}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-px px-1 pt-0.5 pb-1">
        {shown.map(({ event, multiDay }) => (
          <button
            key={`${event.accountId}:${event.id}`}
            type="button"
            onClick={() => setSelected(event)}
            className={cn(
              "flex items-center gap-1.5 truncate rounded-[3px] px-1 text-left text-[11px] transition-colors",
              multiDay ? "text-white/95" : "text-muted-foreground hover:bg-hover",
              isPast(event) && "opacity-60",
            )}
            style={multiDay ? { backgroundColor: colorFor(event) } : undefined}
          >
            {!multiDay && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFor(event) }}
              />
            )}
            {!multiDay && (
              <span className="shrink-0 text-faint">{formatEventStartTime(event)}</span>
            )}
            <span className={cn("truncate", event.status === "cancelled" && "line-through")}>
              {event.title}
            </span>
          </button>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => {
              setDate(date);
              setView("day");
            }}
            className="px-1 text-left text-[11px] text-faint hover:text-muted-foreground"
          >
            {hidden} more
          </button>
        )}

        <button
          type="button"
          aria-label={`New event on ${format(date, "MMMM d")}`}
          onClick={() => {
            const start = startOfDay(date);
            start.setHours(9, 0, 0, 0);
            setDraft({
              start,
              end: new Date(start.getTime() + 3600_000),
              allDay: false,
            });
          }}
          className="min-h-3 flex-1"
        />
      </div>
    </div>
  );
}

export function MonthView() {
  const { date, events } = useCalendar();
  const cells = useMemo(() => monthCells(date), [date]);
  const positions = useMemo(() => monthEventPositions(events, date, VISIBLE_ROWS), [events, date]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border">
        {WEEKDAYS.map((label) => (
          <span
            key={label}
            className="py-2 text-center text-[10px] uppercase tracking-[1.5px] text-faint"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
        {cells.map((cell) => (
          <DayCell
            key={cell.date.toISOString()}
            date={cell.date}
            currentMonth={cell.currentMonth}
            events={events}
            positions={positions}
          />
        ))}
      </div>
    </div>
  );
}
