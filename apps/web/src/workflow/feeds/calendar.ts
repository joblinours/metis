import "server-only";
import { adapterForCalendar } from "@/calendar/aggregate";
import { type EventValue, listEventValues } from "@/ops/values";

import { authorizeCalendar } from "../authorization";
import {
  type FeedContext,
  type FeedEvent,
  type FeedPoll,
  freshCursor,
  literalParam,
  withAbort,
} from "./shared";

const LOOKBACK_MS = 86_400_000;
const LOOKAHEAD_MS = 90 * 86_400_000;
const SNAPSHOT_LIMIT = 1_000;
const RESCAN_EVERY = 10;
const TIME_KINDS = new Set(["trigger.calendar.starting", "trigger.calendar.ended"]);

interface Snapshot {
  h: string;
  s: string;
  e: string;
  r: Record<string, string>;
}

function digest(event: EventValue): string {
  return JSON.stringify([
    event.title,
    event.start,
    event.end,
    event.location,
    event.status,
    event.description.slice(0, 200),
  ]);
}

function snapshotOf(event: EventValue): Snapshot {
  return {
    h: digest(event),
    s: event.start,
    e: event.end,
    r: Object.fromEntries(event.attendees.map((a) => [a.email.toLowerCase(), a.response])),
  };
}

function parseSnapshot(raw: string | undefined): Snapshot | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const own = Object.fromEntries(Object.entries(parsed));
    return {
      h: String(own.h ?? ""),
      s: String(own.s ?? ""),
      e: String(own.e ?? ""),
      r:
        own.r && typeof own.r === "object"
          ? Object.fromEntries(Object.entries(own.r).map(([k, v]) => [k, String(v)]))
          : {},
    };
  } catch {
    return null;
  }
}

export async function pollCalendar(ctx: FeedContext): Promise<FeedPoll> {
  const accountId = literalParam(ctx.node, "calendar");
  const calendarId = literalParam(ctx.node, "calendarId");
  const scope = `calendar:${accountId}:${calendarId || "all"}`;
  const cursor = ctx.cursors.get(scope) ?? freshCursor(scope, ctx.now);
  const authorized = await authorizeCalendar({ principal: ctx.principal, accountId });
  if (!authorized.ok) return { events: [], baseline: false, cursor, error: authorized.reason };
  const account = authorized.value;
  const kind = ctx.trigger.kind;
  const calendarIds = calendarId ? [calendarId] : account.visibleCalendarIds;
  const adapter = TIME_KINDS.has(kind) ? null : await adapterForCalendar(account);
  let signal = adapter?.changes
    ? await withAbort(
        adapter.changes(calendarIds, cursor.baselined ? (cursor.token ?? null) : null),
        ctx.signal,
      )
    : null;
  if (signal?.expired && adapter?.changes) {
    signal = await withAbort(adapter.changes(calendarIds, null), ctx.signal);
  }
  if (
    signal &&
    !signal.expired &&
    !signal.changed &&
    cursor.baselined &&
    cursor.token &&
    cursor.scans % RESCAN_EVERY !== 0
  ) {
    return {
      events: [],
      baseline: false,
      cursor: {
        ...cursor,
        token: signal.cursor,
        scans: cursor.scans + 1,
        updatedAt: ctx.now.toISOString(),
      },
    };
  }

  const lastScan = cursor.baselined ? new Date(cursor.updatedAt) : ctx.now;
  const from = new Date(Math.min(lastScan.getTime(), ctx.now.getTime()) - LOOKBACK_MS);
  const to = new Date(ctx.now.getTime() + LOOKAHEAD_MS);
  const events = await listEventValues(account, {
    from,
    to,
    calendarId: calendarId || undefined,
    limit: SNAPSHOT_LIMIT,
  });
  const previous = cursor.snapshot ?? {};
  const current: Record<string, string> = {};
  const found: FeedEvent[] = [];
  const baselining = !cursor.baselined;
  const self = account.accountEmail.toLowerCase();
  const minutes = (() => {
    const bound = ctx.node.params.minutes;
    return bound?.kind === "literal" && typeof bound.value === "number" ? bound.value : 15;
  })();
  let nextDueAt: Date | undefined;

  for (const event of events) {
    const key = `${event.calendarId}:${event.id}`;
    const snap = snapshotOf(event);
    current[key] = JSON.stringify(snap);
    if (baselining) continue;
    const before = parseSnapshot(previous[key]);
    const at = new Date(event.start);

    if (kind === "trigger.calendar.created" && !before) {
      found.push({ key: `created:${key}`, at: ctx.now, value: event });
    }
    if (
      kind === "trigger.calendar.invited" &&
      !before &&
      event.myResponse === "needsAction" &&
      event.organizer.toLowerCase() !== self
    ) {
      found.push({ key: `invited:${key}`, at: ctx.now, value: event });
    }
    if (
      kind === "trigger.calendar.updated" &&
      before &&
      before.h !== snap.h &&
      event.status !== "cancelled"
    ) {
      found.push({
        key: `updated:${key}:${snap.h.length}:${ctx.now.getTime()}`,
        at: ctx.now,
        value: event,
      });
    }
    if (
      kind === "trigger.calendar.cancelled" &&
      before &&
      event.status === "cancelled" &&
      !before.h.includes('"cancelled"')
    ) {
      found.push({ key: `cancelled:${key}`, at: ctx.now, value: event });
    }
    if (kind === "trigger.calendar.rsvp" && before) {
      for (const attendee of event.attendees) {
        const was = before.r[attendee.email.toLowerCase()];
        if (was !== undefined && was !== attendee.response && attendee.response !== "needsAction") {
          found.push({
            key: `rsvp:${key}:${attendee.email.toLowerCase()}:${attendee.response}`,
            at: ctx.now,
            value: { event, attendee, previous: was },
          });
        }
      }
    }
    if (kind === "trigger.calendar.starting" && event.status !== "cancelled") {
      const fireAt = at.getTime() - minutes * 60_000;
      if (fireAt > lastScan.getTime() && fireAt <= ctx.now.getTime()) {
        found.push({ key: `starting:${key}:${event.start}`, at: new Date(fireAt), value: event });
      } else if (fireAt > ctx.now.getTime() && (!nextDueAt || fireAt < nextDueAt.getTime())) {
        nextDueAt = new Date(fireAt);
      }
    }
    if (kind === "trigger.calendar.ended" && event.status !== "cancelled") {
      const end = new Date(event.end).getTime();
      if (end > lastScan.getTime() && end <= ctx.now.getTime()) {
        found.push({ key: `ended:${key}:${event.end}`, at: new Date(end), value: event });
      } else if (end > ctx.now.getTime() && (!nextDueAt || end < nextDueAt.getTime())) {
        nextDueAt = new Date(end);
      }
    }
  }

  if (!baselining && kind === "trigger.calendar.cancelled") {
    for (const [key, raw] of Object.entries(previous)) {
      if (current[key]) continue;
      const before = parseSnapshot(raw);
      if (!before || new Date(before.s).getTime() < ctx.now.getTime()) continue;
      const [eventCalendarId = "", ...rest] = key.split(":");
      found.push({
        key: `cancelled:${key}`,
        at: ctx.now,
        value: {
          id: rest.join(":"),
          accountId,
          calendarId: eventCalendarId,
          calendar: "",
          title: "",
          description: "",
          location: "",
          start: before.s,
          end: before.e,
          allDay: false,
          status: "cancelled",
          organizer: "",
          attendees: [],
          myResponse: "",
          meetingUrl: "",
          recurring: false,
        },
      });
    }
  }

  return {
    events: found,
    baseline: false,
    nextDueAt,
    cursor: {
      scope,
      snapshot: current,
      token: signal && !signal.expired ? signal.cursor : undefined,
      scans: cursor.scans + 1,
      baselined: true,
      updatedAt: ctx.now.toISOString(),
    },
  };
}
