"use client";

import { format } from "date-fns";

export const HOUR_PX = 64;

export function CalendarTimeline({
  now,
  firstVisibleHour,
  lastVisibleHour,
}: {
  now: Date;
  firstVisibleHour: number;
  lastVisibleHour: number;
}) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const from = firstVisibleHour * 60;
  const span = (lastVisibleHour - firstVisibleHour) * 60;
  const top = ((minutes - from) / span) * 100;

  if (top < 0 || top > 100) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
      style={{ top: `${top}%` }}
    >
      <span className="-translate-x-1/2 -translate-y-1/2 absolute left-0 rounded-sm bg-destructive px-1 py-px text-[9px] font-medium text-destructive-foreground">
        {format(now, "h:mm")}
      </span>
      <span className="h-px w-full bg-destructive" />
    </div>
  );
}
