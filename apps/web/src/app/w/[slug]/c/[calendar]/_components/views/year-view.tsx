"use client";

import { cn } from "@metis/ui/lib/utils";
import { format, isSameDay, isSameMonth, setMonth, startOfYear } from "date-fns";

import { monthCells } from "@/calendar/layout";
import { useNow } from "@/hooks/use-now";

import { useCalendar } from "../calendar-context";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function YearMonth({ month }: { month: Date }) {
  const { setDate, setView } = useCalendar();
  const cells = monthCells(month);
  const today = useNow();

  return (
    <section>
      <h2 className="mb-1.5 pl-1 text-[13px] font-medium text-foreground">
        {format(month, "MMMM")}
      </h2>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label, i) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key --weekday initials repeat (S…S)
            key={`${label}-${i}`}
            className="flex h-6 items-center justify-center text-[10px] text-faint"
          >
            {label}
          </span>
        ))}

        {cells.map((cell) => {
          const outside = !isSameMonth(cell.date, month);
          const isToday = isSameDay(cell.date, today);
          return (
            <button
              key={cell.date.toISOString()}
              type="button"
              onClick={() => {
                setDate(cell.date);
                setView("day");
              }}
              className={cn(
                "flex h-6 items-center justify-center rounded-full text-[11px] transition-colors",
                outside ? "text-faint/60" : "text-muted-foreground",
                !isToday && "hover:bg-hover",
                isToday && "bg-primary font-medium text-primary-foreground",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function YearView() {
  const { date } = useCalendar();
  const yearStart = startOfYear(date);
  const months = Array.from({ length: 12 }, (_, i) => setMonth(yearStart, i));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => (
          <YearMonth key={month.toISOString()} month={month} />
        ))}
      </div>
    </div>
  );
}
