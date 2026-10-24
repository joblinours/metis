import { auth, calendar, type calendar_v3 } from "@googleapis/calendar";

import type { ProviderCalendar } from "@/connections";
import { bind } from "@/lib/bind";
import { BadRequestError } from "@/lib/errors/bad-request";
import type {
  AttendeeResponse,
  CalendarEvent,
  EventAttendee,
  EventConference,
  EventDraft,
  EventPatch,
  EventsResponse,
  ListEventsOptions,
} from "@/types/calendar";

import type { CalendarAdapter } from "../adapter";
import { compactConference, conferenceName } from "../conference";
import { textEventSearch } from "../text-search";

export function googleCalendar(accessToken: string, selfEmail: string): CalendarAdapter {
  return bind<CalendarAdapter, string>(
    {
      listCalendars,
      listEvents,
      getEvent,
      createEvent,
      updateEvent,
      deleteEvent,
      respondToEvent: (token, c, e, r) => respondToEvent(token, c, e, r, selfEmail),
      searchAst: (token, search) => textEventSearch((opts) => listEvents(token, opts), search),
    },
    accessToken,
  );
}

function getCalendarClient(accessToken: string): calendar_v3.Calendar {
  const client = new auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return calendar({ version: "v3", auth: client });
}

function toResponse(value?: string | null): AttendeeResponse | undefined {
  if (value === "accepted") return "accepted";
  if (value === "declined") return "declined";
  if (value === "tentative") return "tentative";
  if (value === "needsAction") return "needsAction";
  return undefined;
}

function attendee(raw: calendar_v3.Schema$EventAttendee) {
  return {
    email: raw.email ?? "",
    name: raw.displayName ?? undefined,
    response: toResponse(raw.responseStatus),
    optional: raw.optional ?? undefined,
    organizer: raw.organizer ?? undefined,
    self: raw.self ?? undefined,
  } satisfies EventAttendee;
}

function toEvent(
  raw: calendar_v3.Schema$Event,
  calendarId: string,
  calendarName?: string,
): CalendarEvent {
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  const start = raw.start?.dateTime ?? raw.start?.date ?? "";
  const end = raw.end?.dateTime ?? raw.end?.date ?? "";
  const video = raw.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video");
  const meetingUrl = raw.hangoutLink ?? video?.uri ?? undefined;
  return {
    id: raw.id ?? "",
    calendarId,
    calendarName,
    title: raw.summary || "(no title)",
    description: raw.description ?? undefined,
    location: raw.location ?? undefined,
    start,
    end,
    allDay,
    status:
      raw.status === "cancelled"
        ? "cancelled"
        : raw.status === "tentative"
          ? "tentative"
          : "confirmed",
    recurring: Boolean(raw.recurringEventId),
    organizer: raw.organizer?.email
      ? {
          email: raw.organizer.email,
          name: raw.organizer.displayName ?? undefined,
        }
      : undefined,
    attendees: raw.attendees?.map(attendee),
    myResponse: toResponse(raw.attendees?.find((a) => a.self)?.responseStatus),
    meetingUrl,
    conference: conferenceFrom(raw.conferenceData, meetingUrl),
    timeZone: raw.start?.timeZone ?? null,
    updatedAt: raw.updated ?? undefined,
  };
}

function conferenceFrom(
  data: calendar_v3.Schema$ConferenceData | undefined,
  meetingUrl: string | undefined,
): EventConference | undefined {
  const entries = data?.entryPoints ?? [];
  const video = entries.find((entry) => entry.entryPointType === "video");
  return compactConference({
    name: data?.conferenceSolution?.name ?? conferenceName(meetingUrl),
    meetingId: video?.meetingCode ?? data?.conferenceId ?? undefined,
    passcode: video?.passcode ?? video?.password ?? video?.accessCode ?? undefined,
    phones: entries
      .filter((entry) => entry.entryPointType === "phone")
      .map((entry) => ({
        number: entry.label ?? entry.uri?.replace(/^tel:/i, "") ?? "",
        label: entry.regionCode ?? undefined,
        pin: entry.pin ?? entry.accessCode ?? entry.passcode ?? undefined,
      })),
  });
}

function toGoogleTime(
  value: string,
  allDay: boolean,
  timeZone?: string,
): calendar_v3.Schema$EventDateTime {
  if (allDay) return { date: value.slice(0, 10) };
  return { dateTime: value, timeZone };
}

function toGoogleBody(draft: EventDraft | EventPatch): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {};
  if (draft.title !== undefined) body.summary = draft.title;
  if (draft.description !== undefined) body.description = draft.description;
  if (draft.location !== undefined) body.location = draft.location;
  if (draft.start !== undefined) {
    body.start = toGoogleTime(draft.start, draft.allDay === true, draft.timeZone);
  }
  if (draft.end !== undefined) {
    body.end = toGoogleTime(draft.end, draft.allDay === true, draft.timeZone);
  }
  if (draft.attendees !== undefined) {
    body.attendees = draft.attendees.map((email) => ({ email }));
  }
  return body;
}

async function listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
  const res = await getCalendarClient(accessToken).calendarList.list({
    maxResults: 250,
    showHidden: true,
  });

  return (res.data.items ?? [])
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      name: item.summaryOverride || item.summary || String(item.id),
      description: item.description ?? null,
      color: item.backgroundColor ?? null,
      timeZone: item.timeZone ?? null,
      primary: item.primary === true,
      readOnly: item.accessRole === "reader" || item.accessRole === "freeBusyReader",
    }));
}

async function listEvents(accessToken: string, opts: ListEventsOptions): Promise<EventsResponse> {
  const client = getCalendarClient(accessToken);
  const calendars = await listCalendars(accessToken);
  const wanted = opts.calendarIds
    ? calendars.filter((c) => opts.calendarIds?.includes(c.id))
    : calendars;

  const pages = await Promise.all(
    wanted.map(async (cal) => {
      const res = await client.events.list({
        calendarId: cal.id,
        singleEvents: true,
        orderBy: "startTime",
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
        maxResults: opts.max ?? 250,
        q: opts.query,
      });
      return (res.data.items ?? []).map((raw) => toEvent(raw, cal.id, cal.name));
    }),
  );

  return { events: pages.flat() };
}

async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  const res = await getCalendarClient(accessToken).events.get({
    calendarId,
    eventId,
  });
  return toEvent(res.data, calendarId);
}

async function createEvent(
  accessToken: string,
  draft: EventDraft,
): Promise<{ id: string; calendarId: string }> {
  const calendarId = draft.calendarId ?? "primary";
  const requestBody = toGoogleBody(draft);
  if (draft.addMeeting) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await getCalendarClient(accessToken).events.insert({
    calendarId,
    sendUpdates: "all",
    conferenceDataVersion: 1,
    requestBody,
  });
  return { id: res.data.id ?? "", calendarId };
}

async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  await getCalendarClient(accessToken).events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: toGoogleBody(patch),
  });
}

async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await getCalendarClient(accessToken).events.delete({
    calendarId,
    eventId,
    sendUpdates: "all",
  });
}

async function respondToEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  response: AttendeeResponse,
  selfEmail: string,
): Promise<void> {
  const client = getCalendarClient(accessToken);
  const event = await client.events.get({ calendarId, eventId });

  const me = selfEmail.toLowerCase();
  const listed = event.data.attendees ?? [];
  if (!listed.some((a) => a.email?.toLowerCase() === me)) {
    throw new BadRequestError("You are not an attendee on this event");
  }
  const attendees = listed.map((a) =>
    a.email?.toLowerCase() === me ? { ...a, responseStatus: response } : a,
  );

  await client.events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: { attendees },
  });
}
