import {
  type CalendarProvider,
  type ConnectionAuth,
  caldavCredentials,
  oauthToken,
  type ProviderCalendar,
} from "@/connections";
import type {
  AttendeeResponse,
  CalendarEvent,
  EventDraft,
  EventPatch,
  EventsResponse,
  ListEventsOptions,
} from "@/types/calendar";

import { caldavCalendar } from "./providers/caldav";
import { googleCalendar } from "./providers/google";
import { microsoftCalendar } from "./providers/microsoft";
import { zohoCalendar } from "./providers/zoho";
import type { EventAstSearch } from "./text-search";

export interface CalendarChangeSignal {
  cursor: string;
  changed: boolean;
  expired?: boolean;
}

export interface CalendarAdapter {
  listCalendars(): Promise<ProviderCalendar[]>;
  listEvents(opts: ListEventsOptions): Promise<EventsResponse>;
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  createEvent(draft: EventDraft): Promise<{ id: string; calendarId: string }>;
  updateEvent(calendarId: string, eventId: string, patch: EventPatch): Promise<void>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  respondToEvent(calendarId: string, eventId: string, response: AttendeeResponse): Promise<void>;
  searchAst(search: EventAstSearch): Promise<EventsResponse>;
  changes?(calendarIds: string[], cursor: string | null): Promise<CalendarChangeSignal | null>;
}

const CALENDAR_ADAPTERS: Record<
  CalendarProvider,
  (auth: ConnectionAuth, selfEmail: string) => CalendarAdapter
> = {
  google: (auth, self) => googleCalendar(oauthToken(auth), self),
  microsoft: (auth) => microsoftCalendar(oauthToken(auth)),
  zoho: (auth, self) => zohoCalendar(oauthToken(auth), self),
  caldav: (auth, self) => caldavCalendar(caldavCredentials(auth), self),
};

export function getCalendarAdapter(
  provider: CalendarProvider,
  auth: ConnectionAuth,
  selfEmail = "",
): CalendarAdapter {
  return CALENDAR_ADAPTERS[provider](auth, selfEmail);
}
