import "server-only";
import { conjuncts, type ParserAst, tagKey, tagText } from "@/search/ast";
import { parseSearchDate } from "@/search/dates";
import { matcherFor, needsKey, type SearchDoc } from "@/search/match";
import { bindTags } from "@/search/pushdown";
import type { CalendarEvent, CalendarSourceError } from "@/types/calendar";

import { listCalendarsAcross, type ResolvedCalendar, searchEventsAcross } from "./aggregate";

const DAY_MS = 86_400_000;
const DEFAULT_BACK_DAYS = 365;
const DEFAULT_FORWARD_DAYS = 365;

export interface EventSearchHit extends CalendarEvent {
  ai?: boolean;
}

export interface EventSearchResult {
  events: EventSearchHit[];
  calendarErrors?: CalendarSourceError[];
}

function millis(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function eventSearchDoc(event: CalendarEvent): SearchDoc {
  const attendees = (event.attendees ?? []).flatMap((a) => [a.email, a.name ?? ""]);
  const organizer = event.organizer ? [event.organizer.email, event.organizer.name ?? ""] : [];
  return {
    type: "event",
    text: [event.title, event.description ?? "", event.location ?? "", ...attendees, ...organizer],
    title: event.title,
    attendee: attendees,
    organizer,
    location: event.location ?? "",
    is: event.myResponse ? [event.myResponse] : [],
    "sub-calendar": event.calendarName ?? "",
    calendar: [event.accountSlug ?? "", event.accountEmail ?? ""],
    date: millis(event.start),
  };
}

function searchWindow(
  query: ParserAst | boolean,
  timeZone: string,
): { timeMin: string; timeMax: string } {
  const now = Date.now();
  let min = now - DEFAULT_BACK_DAYS * DAY_MS;
  let max = now + DEFAULT_FORWARD_DAYS * DAY_MS;
  if (typeof query !== "boolean") {
    for (const node of conjuncts(query)) {
      if (node.type !== "Tag") continue;
      const key = tagKey(node);
      if (key !== "after" && key !== "before" && key !== "on") continue;
      const span = parseSearchDate(tagText(node) ?? "", timeZone, now);
      if (!span) continue;
      if (key === "after" || key === "on") min = Math.max(min, span.start);
      if (key === "before") max = Math.min(max, span.start);
      if (key === "on") {
        max = Math.min(max, Math.max(span.end, span.start + DAY_MS));
      }
    }
  }
  if (max <= min) max = min + DAY_MS;
  return {
    timeMin: new Date(min).toISOString(),
    timeMax: new Date(max).toISOString(),
  };
}

function isAccountTag(value: string, account: ResolvedCalendar): boolean {
  const lower = value.toLowerCase();
  return (
    lower === account.accountSlug.toLowerCase() || lower === account.accountEmail.toLowerCase()
  );
}

export async function searchEvents(
  accounts: ResolvedCalendar[],
  query: ParserAst | boolean,
  opts: { timeZone: string },
): Promise<EventSearchResult> {
  if (query === false || accounts.length === 0) return { events: [] };
  const window = searchWindow(query, opts.timeZone);

  const names = needsKey(typeof query === "boolean" ? null : query, "sub-calendar")
    ? new Map(
        (await listCalendarsAcross(accounts)).calendars.map((c) => [
          `${c.accountId}:${c.id}`,
          c.name,
        ]),
      )
    : null;

  const res = await searchEventsAcross(accounts, (account) => {
    const bound = bindTags(query, (tag) =>
      tagKey(tag) === "calendar" ? isAccountTag(tagText(tag) ?? "", account) : null,
    );
    if (bound === false) return null;
    return {
      ...window,
      query: bound,
      timeZone: opts.timeZone,
      accept: async (residual, events) => {
        if (!residual) return events;
        const matcher = matcherFor(residual, opts.timeZone);
        return events.filter((event) =>
          matcher.matches(
            eventSearchDoc({
              ...event,
              calendarName:
                event.calendarName ?? names?.get(`${account.accountId}:${event.calendarId}`),
            }),
          ),
        );
      },
    };
  });

  const policies = new Map(accounts.map((a) => [a.accountId, a.policy.ai]));
  return {
    events: res.events.map((event) => ({
      ...event,
      calendarName: event.calendarName ?? names?.get(`${event.accountId}:${event.calendarId}`),
      ai: event.accountId ? (policies.get(event.accountId) ?? false) : false,
    })),
    calendarErrors: res.calendarErrors,
  };
}
