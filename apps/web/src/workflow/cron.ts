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
