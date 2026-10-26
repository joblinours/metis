import { CronExpressionParser } from "cron-parser";

export function validTimezone(timezone: string): boolean {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone !== ""
    );
  } catch {
    return false;
  }
}

export function validCron(expression: string, timezone: string): boolean {
  if (expression.trim().split(/\s+/).length !== 5) return false;
  if (!validTimezone(timezone)) return false;
  try {
    CronExpressionParser.parse(expression, { tz: timezone });
    return true;
  } catch {
    return false;
  }
}

export function nextCronAt(expression: string, timezone: string, after: Date): Date | null {
  try {
    const it = CronExpressionParser.parse(expression, {
      tz: timezone,
      currentDate: after,
    });
    return it.next().toDate();
  } catch {
    return null;
  }
}

const MAX_SCAN = 5_000;

export interface CoalescedSchedule {
  firedFor: Date;
  missed: number;
  next: Date | null;
}

export function coalesceMissed(
  expression: string,
  timezone: string,
  dueAt: Date,
  now: Date,
): CoalescedSchedule {
  let missed = 0;
  let last = dueAt;

  try {
    const it = CronExpressionParser.parse(expression, {
      tz: timezone,
      currentDate: dueAt,
    });
    for (let i = 0; i < MAX_SCAN; i += 1) {
      const candidate = it.next().toDate();
      if (candidate.getTime() > now.getTime()) {
        return { firedFor: last, missed, next: candidate };
      }
      missed += 1;
      last = candidate;
    }
  } catch {
    return { firedFor: dueAt, missed: 0, next: null };
  }

  return {
    firedFor: last,
    missed,
    next: nextCronAt(expression, timezone, now),
  };
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type Schedule =
  | { mode: "hourly"; minute: number }
  | { mode: "daily"; hour: number; minute: number }
  | { mode: "weekdays"; hour: number; minute: number }
  | { mode: "weekly"; day: number; hour: number; minute: number }
  | { mode: "monthly"; date: number; hour: number; minute: number }
  | { mode: "custom"; cron: string };

export type ScheduleMode = Schedule["mode"];

const NUMBER = /^\d{1,2}$/;

function field(value: string | undefined, max: number): number | null {
  if (value === undefined || !NUMBER.test(value)) return null;
  const n = Number(value);
  return n <= max ? n : null;
}

export function parseSchedule(expression: string): Schedule {
  const custom: Schedule = { mode: "custom", cron: expression };
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return custom;
  const [m, h, dom, month, dow] = parts;
  const minute = field(m, 59);
  if (minute === null || month !== "*") return custom;
  if (h === "*" && dom === "*" && dow === "*") return { mode: "hourly", minute };
  const hour = field(h, 23);
  if (hour === null) return custom;
  if (dom === "*" && dow === "*") return { mode: "daily", hour, minute };
  if (dom === "*" && dow === "1-5") return { mode: "weekdays", hour, minute };
  const day = dom === "*" ? field(dow, 6) : null;
  if (day !== null) return { mode: "weekly", day, hour, minute };
  const date = dow === "*" ? field(dom, 31) : null;
  if (date !== null && date > 0) return { mode: "monthly", date, hour, minute };
  return custom;
}

export function scheduleCron(schedule: Schedule): string {
  switch (schedule.mode) {
    case "hourly":
      return `${schedule.minute} * * * *`;
    case "daily":
      return `${schedule.minute} ${schedule.hour} * * *`;
    case "weekdays":
      return `${schedule.minute} ${schedule.hour} * * 1-5`;
    case "weekly":
      return `${schedule.minute} ${schedule.hour} * * ${schedule.day}`;
    case "monthly":
      return `${schedule.minute} ${schedule.hour} ${schedule.date} * *`;
    case "custom":
      return schedule.cron;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

export function clockTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

export function describeSchedule(expression: string): string | null {
  const schedule = parseSchedule(expression);
  switch (schedule.mode) {
    case "hourly":
      return schedule.minute === 0 ? "Every hour" : `Every hour at :${pad(schedule.minute)}`;
    case "daily":
      return `Every day at ${clockTime(schedule.hour, schedule.minute)}`;
    case "weekdays":
      return `Weekdays at ${clockTime(schedule.hour, schedule.minute)}`;
    case "weekly":
      return `${WEEKDAY_NAMES[schedule.day]}s at ${clockTime(schedule.hour, schedule.minute)}`;
    case "monthly":
      return `Monthly on day ${schedule.date} at ${clockTime(schedule.hour, schedule.minute)}`;
    case "custom":
      return null;
  }
}

export function nextCronRuns(
  expression: string,
  timezone: string,
  after: Date,
  count: number,
): Date[] {
  if (!validCron(expression, timezone)) return [];
  try {
    const it = CronExpressionParser.parse(expression, { tz: timezone, currentDate: after });
    return Array.from({ length: count }, () => it.next().toDate());
  } catch {
    return [];
  }
}
