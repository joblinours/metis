import { Client } from "@microsoft/microsoft-graph-client";
import type {
  Attendee,
  Calendar as GraphCalendar,
  Event as GraphEvent,
} from "@microsoft/microsoft-graph-types";

import type { ProviderCalendar } from "@/connections";
import { bind } from "@/lib/bind";
import type {
  AttendeeResponse,
  CalendarEvent,
  EventAttendee,
  EventDraft,
  EventPatch,
  EventsResponse,
  ListEventsOptions,
} from "@/types/calendar";

import type { CalendarAdapter } from "../adapter";
import { compactConference, conferenceName } from "../conference";
import { textEventSearch } from "../text-search";

export function microsoftCalendar(accessToken: string): CalendarAdapter {
  return bind<CalendarAdapter, string>(
    {
      listCalendars,
      listEvents,
      getEvent,
      createEvent,
      updateEvent,
      deleteEvent,
      respondToEvent,
      searchAst: (token, search) => textEventSearch((opts) => listEvents(token, opts), search),
    },
    accessToken,
  );
}

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function toResponse(value?: string | null): AttendeeResponse | undefined {
  if (value === "accepted" || value === "organizer") return "accepted";
  if (value === "declined") return "declined";
  if (value === "tentativelyAccepted") return "tentative";
  if (value === "notResponded" || value === "none") return "needsAction";
  return undefined;
}

function attendee(raw: Attendee) {
  return {
    email: raw.emailAddress?.address ?? "",
    name: raw.emailAddress?.name ?? undefined,
    response: toResponse(raw.status?.response),
    optional: raw.type === "optional",
  } satisfies EventAttendee;
}

function withZone(value: string | undefined | null, zone: string | undefined | null): string {
  if (!value) return "";
  if (/[Z+]|-\d{2}:\d{2}$/.test(value)) return value;
  return zone === "UTC" || zone === undefined || zone === null ? `${value}Z` : value;
}

function toEvent(raw: GraphEvent, calendarId: string, calendarName?: string): CalendarEvent {
  const meetingUrl = raw.onlineMeeting?.joinUrl ?? raw.onlineMeetingUrl ?? undefined;
  return {
    id: raw.id ?? "",
    calendarId,
    calendarName,
    title: raw.subject || "(no title)",
    description: raw.bodyPreview ?? raw.body?.content ?? undefined,
    location: raw.location?.displayName ?? undefined,
    start: withZone(raw.start?.dateTime, raw.start?.timeZone),
    end: withZone(raw.end?.dateTime, raw.end?.timeZone),
    allDay: raw.isAllDay === true,
    status: raw.isCancelled ? "cancelled" : raw.showAs === "tentative" ? "tentative" : "confirmed",
    recurring: Boolean(raw.seriesMasterId) || raw.type === "occurrence",
    organizer: raw.organizer?.emailAddress?.address
      ? {
          email: raw.organizer.emailAddress.address,
          name: raw.organizer.emailAddress.name ?? undefined,
        }
      : undefined,
    attendees: raw.attendees?.map(attendee),
    myResponse: toResponse(raw.responseStatus?.response),
    meetingUrl,
    conference: conferenceFrom(raw, meetingUrl),
    timeZone: raw.start?.timeZone ?? null,
    updatedAt: raw.lastModifiedDateTime ?? undefined,
  };
}

const MEETING_PROVIDER_NAMES: Record<string, string> = {
  teamsForBusiness: "Microsoft Teams",
  skypeForBusiness: "Skype for Business",
  skypeForConsumer: "Skype",
};

function conferenceFrom(raw: GraphEvent, meetingUrl: string | undefined) {
  const meeting = raw.onlineMeeting;
  const pin = meeting?.conferenceId ?? undefined;
  const listed = (meeting?.phones ?? []).map((phone) => ({
    number: phone.number ?? "",
    label: phone.type ?? undefined,
    pin,
  }));
  const phones = listed.length
    ? listed
    : [
        ...(meeting?.tollNumber ? [{ number: meeting.tollNumber, label: "Toll", pin }] : []),
        ...(meeting?.tollFreeNumbers ?? []).map((number) => ({
          number,
          label: "Toll-free",
          pin,
        })),
      ];
  return compactConference({
    name: MEETING_PROVIDER_NAMES[raw.onlineMeetingProvider ?? ""] ?? conferenceName(meetingUrl),
    phones,
  });
}

function toGraphBody(draft: EventDraft | EventPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const zone = draft.timeZone ?? "UTC";
  if (draft.title !== undefined) body.subject = draft.title;
  if (draft.description !== undefined) {
    body.body = { contentType: "text", content: draft.description };
  }
  if (draft.location !== undefined) {
    body.location = { displayName: draft.location };
  }
  if (draft.start !== undefined) {
    body.start = { dateTime: draft.start, timeZone: zone };
  }
  if (draft.end !== undefined) {
    body.end = { dateTime: draft.end, timeZone: zone };
  }
  if (draft.allDay !== undefined) body.isAllDay = draft.allDay;
  if (draft.attendees !== undefined) {
    body.attendees = draft.attendees.map((email) => ({
      emailAddress: { address: email },
      type: "required",
    }));
  }
  return body;
}

async function listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
  const data: { value?: GraphCalendar[] } = await getGraphClient(accessToken)
    .api("/me/calendars")
    .top(100)
    .get();

  return (data.value ?? [])
    .filter((item) => Boolean(item.id))
    .map((item) => ({
      id: String(item.id),
      name: item.name || String(item.id),
      description: null,
      color: item.hexColor || null,
      timeZone: null,
      primary: item.isDefaultCalendar === true,
      readOnly: item.canEdit === false,
    }));
}

async function listEvents(accessToken: string, opts: ListEventsOptions): Promise<EventsResponse> {
  const client = getGraphClient(accessToken);
  const calendars = await listCalendars(accessToken);
  const wanted = opts.calendarIds
    ? calendars.filter((c) => opts.calendarIds?.includes(c.id))
    : calendars;

  const pages = await Promise.all(
    wanted.map(async (cal) => {
      let request = client
        .api(`/me/calendars/${cal.id}/calendarView`)
        .query({ startDateTime: opts.timeMin, endDateTime: opts.timeMax })
        .top(opts.max ?? 250)
        .orderby("start/dateTime");
      if (opts.query) request = request.search(`"${opts.query}"`);

      const data: { value?: GraphEvent[] } = await request.get();
      return (data.value ?? []).map((raw) => toEvent(raw, cal.id, cal.name));
    }),
  );

  return { events: pages.flat() };
}

async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<CalendarEvent> {
  const raw: GraphEvent = await getGraphClient(accessToken)
    .api(`/me/calendars/${calendarId}/events/${eventId}`)
    .get();
  return toEvent(raw, calendarId);
}

async function createEvent(
  accessToken: string,
  draft: EventDraft,
): Promise<{ id: string; calendarId: string }> {
  const path = draft.calendarId ? `/me/calendars/${draft.calendarId}/events` : "/me/events";

  const body = toGraphBody(draft);
  if (draft.addMeeting) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }

  const created: GraphEvent = await getGraphClient(accessToken).api(path).post(body);
  return { id: created.id ?? "", calendarId: draft.calendarId ?? "" };
}

async function updateEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  await getGraphClient(accessToken).api(`/me/events/${eventId}`).patch(toGraphBody(patch));
}

async function deleteEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
): Promise<void> {
  await getGraphClient(accessToken).api(`/me/events/${eventId}`).delete();
}

const RESPOND_PATH: Record<AttendeeResponse, string | null> = {
  accepted: "accept",
  declined: "decline",
  tentative: "tentativelyAccept",
  needsAction: null,
};

async function respondToEvent(
  accessToken: string,
  _calendarId: string,
  eventId: string,
  response: AttendeeResponse,
): Promise<void> {
  const action = RESPOND_PATH[response];
  if (!action) throw new Error("Outlook cannot reset an invite response");

  await getGraphClient(accessToken)
    .api(`/me/events/${eventId}/${action}`)
    .post({ sendResponse: true });
}
