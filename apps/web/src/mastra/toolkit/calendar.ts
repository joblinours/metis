import "server-only";
import {
  adapterForCalendar,
  assertWritable,
  listCalendarsAcross,
  listEventsAcross,
  type ResolvedCalendar,
} from "@/calendar/aggregate";
import { truncate } from "@/lib/utils";
import type { WritableAttendeeResponse } from "@/types/calendar";

export interface EventWriteInput {
  calendarId?: string;
  title?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  attendees?: string[];
  timeZone?: string;
}

export async function listCalendars(accounts: ResolvedCalendar[]) {
  const { calendars, errors } = await listCalendarsAcross(accounts);
  return {
    accountCount: accounts.length,
    calendars: calendars
      .filter((c) => c.visible)
      .map((c) => ({
        calendarAccountId: c.accountId,
        accountEmail: c.accountEmail,
        provider: c.provider,
        calendarId: c.id,
        name: c.name,
        primary: c.primary,
        readOnly: c.readOnly,
        timeZone: c.timeZone,
      })),
    errors: errors.length ? errors : undefined,
  };
}

export async function listEvents(
  accounts: ResolvedCalendar[],
  args: {
    timeMin: string;
    timeMax: string;
    calendarIds?: string[];
    query?: string;
    max?: number;
  },
) {
  const res = await listEventsAcross(accounts, args);
  return {
    count: res.events.length,
    events: res.events.map((event) => ({
      eventId: event.id,
      calendarAccountId: event.accountId,
      accountEmail: event.accountEmail,
      calendarId: event.calendarId,
      calendarName: event.calendarName,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      location: event.location,
      status: event.status,
      attendees: event.attendees?.map((a) => a.email),
    })),
    errors: res.calendarErrors,
  };
}

export async function getEvent(account: ResolvedCalendar, calendarId: string, eventId: string) {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  const event = await adapter.getEvent(calendarId, eventId);
  return {
    ...event,
    description: event.description ? truncate(event.description, 4000) : undefined,
    calendarAccountId: account.accountId,
    accountEmail: account.accountEmail,
  };
}

export async function createEvent(
  account: ResolvedCalendar,
  input: EventWriteInput & { title: string; start: string; end: string },
) {
  if (input.calendarId) assertWritable(account, input.calendarId);
  const adapter = await adapterForCalendar(account);
  const created = await adapter.createEvent({
    calendarId: input.calendarId,
    title: input.title,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    attendees: input.attendees,
    timeZone: input.timeZone,
  });
  return {
    created: true,
    eventId: created.id,
    calendarId: created.calendarId,
    calendarAccountId: account.accountId,
    title: input.title,
  };
}

export async function updateEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  input: EventWriteInput,
) {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.updateEvent(calendarId, eventId, {
    title: input.title,
    description: input.description,
    location: input.location,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    attendees: input.attendees,
    timeZone: input.timeZone,
  });
  return { updated: true, eventId };
}

export async function deleteEvent(account: ResolvedCalendar, calendarId: string, eventId: string) {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.deleteEvent(calendarId, eventId);
  return { deleted: true, eventId };
}

export async function respondToEvent(
  account: ResolvedCalendar,
  calendarId: string,
  eventId: string,
  response: WritableAttendeeResponse,
) {
  assertWritable(account, calendarId);
  const adapter = await adapterForCalendar(account);
  await adapter.respondToEvent(calendarId, eventId, response);
  return { responded: true, eventId, response };
}
