"use client";

import { addDays, startOfWeek } from "date-fns";

import { useCalendar } from "../calendar-context";
import { HourGrid } from "../hour-grid";

export function WeekView() {
  const { date } = useCalendar();
  const weekStart = startOfWeek(date);
  return <HourGrid days={Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))} />;
}
