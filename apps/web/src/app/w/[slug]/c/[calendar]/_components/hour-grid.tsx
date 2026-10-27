"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@metis/ui/lib/utils";
import { areIntervalsOverlapping, format, isToday, setHours, startOfDay } from "date-fns";
import { useEffect, useRef } from "react";

import {
  eventBlockStyle,
  eventEnd,
  eventStart,
  eventsForDay,
  groupOverlapping,
  splitEvents,
  viewerOffsetLabel,
  visibleHourRange,
} from "@/calendar/layout";
import { useNow } from "@/hooks/use-now";

import { AllDayRow } from "./all-day-row";
import { useCalendar } from "./calendar-context";
import { EventBlock } from "./event-block";
import { useEventColor } from "./event-colors";
import { CalendarTimeline, HOUR_PX } from "./time-line";

const QUARTERS = [0, 15, 30, 45];

function DayColumn({ day, children }: { day: Date; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: day.toISOString(),
    data: { day },
  });
  return (
    <div ref={setNodeRef} className={cn("relative", isOver && "bg-brand-soft/30")}>
      {children}
    </div>
  );
}

export function HourGrid({ days }: { days: Date[] }) {
  const { events, setDraft } = useCalendar();
  const colorFor = useEventColor();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { banded, timed } = splitEvents(events);
  const { hours, from, to } = visibleHourRange({ from: 0, to: 24 }, timed);

  useEffect(() => {
    if (scrolled.current || !scrollRef.current) return;
    scrolled.current = true;
    scrollRef.current.scrollTop = Math.max(0, (8 - from) * HOUR_PX - 12);
  }, [from]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-20 flex shrink-0 border-b border-border">
        <div className="w-16 shrink-0" />
        <div
          className="grid flex-1"
          style={{
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {days.map((day) => (
            <div key={day.toISOString()} className="flex flex-col items-center gap-1 py-2">
              <span className="text-[10px] uppercase tracking-[1.5px] text-faint">
                {format(day, "EEE")}
              </span>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[20px] font-medium",
                  isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AllDayRow days={days} events={banded} />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex">
          <div className="relative w-16 shrink-0">
            <span className="absolute top-1 right-1 whitespace-nowrap text-[9px] text-faint">
              {viewerOffsetLabel()}
            </span>
            {hours.map((hour, index) => (
              <div key={hour} className="relative" style={{ height: HOUR_PX }}>
                {index !== 0 && Math.abs(hour * 60 - nowMinutes) >= 15 && (
                  <span className="absolute -top-2 right-2 text-[10px] text-faint">
                    {format(setHours(now, hour), "h a")}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="relative flex-1 border-l border-border">
            <div
              className="grid divide-x divide-border-soft"
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              }}
            >
              {days.map((day) => {
                const dayEvents = eventsForDay(timed, day);
                const groups = groupOverlapping(dayEvents);

                return (
                  <DayColumn key={day.toISOString()} day={day}>
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="relative border-b border-border-soft"
                        style={{ height: HOUR_PX }}
                      >
                        {QUARTERS.map((minute) => (
                          <button
                            key={minute}
                            type="button"
                            aria-label={`New event at ${format(new Date().setHours(hour, minute, 0, 0), "h:mm a")}`}
                            onClick={() => {
                              const start = startOfDay(day);
                              start.setHours(hour, minute, 0, 0);
                              setDraft({
                                start,
                                end: new Date(start.getTime() + 3600_000),
                                allDay: false,
                              });
                            }}
                            className="absolute inset-x-0 cursor-pointer transition-colors hover:bg-hover"
                            style={{
                              top: (minute / 60) * HOUR_PX,
                              height: HOUR_PX / 4,
                            }}
                          />
                        ))}
                        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-b border-dashed border-border-soft" />
                      </div>
                    ))}

                    {groups.map((group, groupIndex) =>
                      group.map((event) => {
                        let style = eventBlockStyle(event, day, groupIndex, groups.length, {
                          from,
                          to,
                        });

                        const overlaps = groups.some(
                          (other, otherIndex) =>
                            otherIndex !== groupIndex &&
                            other.some((candidate) =>
                              areIntervalsOverlapping(
                                {
                                  start: eventStart(event),
                                  end: eventEnd(event),
                                },
                                {
                                  start: eventStart(candidate),
                                  end: eventEnd(candidate),
                                },
                              ),
                            ),
                        );
                        if (!overlaps) style = { ...style, width: "100%", left: "0%" };

                        return (
                          <div
                            key={`${event.accountId}:${event.id}`}
                            className="absolute z-10 p-px"
                            style={style}
                          >
                            <EventBlock event={event} color={colorFor(event)} />
                          </div>
                        );
                      }),
                    )}
                  </DayColumn>
                );
              })}
            </div>

            <CalendarTimeline now={now} firstVisibleHour={from} lastVisibleHour={to} />
          </div>
        </div>
      </div>
    </div>
  );
}
