"use client";

import { cn } from "@metis/ui/lib/utils";
import { format, isToday } from "date-fns";
import { useMemo } from "react";

import { formatEventTime, isPast, scheduleGroups } from "@/calendar/layout";

import { useCalendar } from "../calendar-context";
import { useEventColor } from "../event-colors";

export function ScheduleView() {
  const { events, range, setSelected } = useCalendar();
  const colorFor = useEventColor();

  const groups = useMemo(() => scheduleGroups(events, range), [events, range]);

  if (groups.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-[13px] text-faint">Nothing scheduled in this range.</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group) => (
        <div
          key={group.date.toISOString()}
          className="flex gap-4 border-b border-border-soft px-4 py-3 last:border-b-0"
        >
          <div className="flex w-24 shrink-0 items-baseline gap-2">
            <span
              className={cn(
                "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[18px] font-medium",
                isToday(group.date) ? "bg-primary text-primary-foreground" : "text-foreground",
              )}
            >
              {format(group.date, "d")}
            </span>
            <span className="text-[10px] uppercase tracking-[1.5px] text-faint">
              {format(group.date, "MMM, EEE")}
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {group.events.map((event) => (
              <button
                key={`${event.accountId}:${event.id}`}
                type="button"
                onClick={() => setSelected(event)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover",
                  isPast(event) && "opacity-60",
                )}
              >
                <span className="w-28 shrink-0 text-[12px] text-muted-foreground">
                  {formatEventTime(event)}
                </span>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: colorFor(event) }}
                />
                <span
                  className={cn(
                    "truncate text-[13px] text-foreground",
                    event.status === "cancelled" && "line-through",
                  )}
                >
                  {event.title}
                </span>
                {event.accountEmail && (
                  <span className="ml-auto shrink-0 truncate font-mono text-[10px] text-faint">
                    {event.accountEmail}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
