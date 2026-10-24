"use client";

import { useCalendar } from "../calendar-context";
import { HourGrid } from "../hour-grid";

export function DayView() {
  const { date } = useCalendar();
  return <HourGrid days={[date]} />;
}
