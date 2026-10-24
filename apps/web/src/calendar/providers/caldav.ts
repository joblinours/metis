import "server-only";
import ICAL from "ical.js";
import { createDAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";
import { Agent } from "undici";

import type { CaldavCredentials, ProviderCalendar } from "@/connections";
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

export function caldavCalendar(credentials: CaldavCredentials, selfEmail: string): CalendarAdapter {
  return bind<CalendarAdapter, CaldavCredentials>(
    {
      listCalendars,
      listEvents: (c, opts) => listEvents(c, opts, selfEmail),
      getEvent: (c, cal, e) => getEvent(c, cal, e, selfEmail),
      createEvent,
      updateEvent,
      deleteEvent,
      respondToEvent: (c, cal, e, r) => respondToEvent(c, cal, e, r, selfEmail),
      searchAst: (c, search) => textEventSearch((opts) => listEvents(c, opts, selfEmail), search),
    },
    credentials,
  );
}

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>;

const CLIENT_TTL_MS = 5 * 60_000;
const MAX_EMITTED_OCCURRENCES = 750;
const MAX_SCANNED_OCCURRENCES = 20_000;
const OCCURRENCE_SEPARATOR = "#";

const CALENDAR_PROPS = {
  "c:calendar-description": {},
  "c:calendar-timezone": {},
  "d:displayname": {},
  "ca:calendar-color": {},
  "cs:getctag": {},
  "d:resourcetype": {},
  "c:supported-calendar-component-set": {},
  "d:sync-token": {},
  "d:current-user-privilege-set": {},
};

const CALENDAR_PROJECTED_PROPS = { currentUserPrivilegeSet: true };

interface CachedClient {
  client: DAVClient;
  calendars: DAVCalendar[] | null;
  expiresAt: number;
}

const clients = new Map<string, CachedClient>();
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

function clientKey(credentials: CaldavCredentials): string {
  return JSON.stringify([
    credentials.url,
    credentials.user,
    credentials.pass,
    credentials.allowInsecureTls,
  ]);
}

function fetchOptions(credentials: CaldavCredentials): RequestInit {
  return credentials.allowInsecureTls ? { dispatcher: insecureAgent } : {};
}

async function getClient(credentials: CaldavCredentials): Promise<DAVClient> {
  const key = clientKey(credentials);
  const cached = clients.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.client;

  const client = await createDAVClient({
    serverUrl: credentials.url,
    credentials: {
      username: credentials.user,
      password: credentials.pass,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetchOptions: fetchOptions(credentials),
  });

  clients.set(key, {
    client,
    calendars: null,
    expiresAt: Date.now() + CLIENT_TTL_MS,
  });
  return client;
}

async function davCalendars(credentials: CaldavCredentials): Promise<DAVCalendar[]> {
  const key = clientKey(credentials);
  const client = await getClient(credentials);
  const cached = clients.get(key);
  if (cached?.calendars) return cached.calendars;

  const calendars = (
    await client.fetchCalendars({
      props: CALENDAR_PROPS,
      projectedProps: CALENDAR_PROJECTED_PROPS,
      fetchOptions: fetchOptions(credentials),
    })
  ).filter((calendar) => !calendar.components || calendar.components.includes("VEVENT"));

  if (cached) cached.calendars = calendars;
  return calendars;
}

function displayName(calendar: DAVCalendar): string {
  const name = calendar.displayName;
  if (typeof name === "string" && name) return name;
  const decoded = decodeURIComponent(calendar.url.replace(/\/$/, ""));
  return decoded.slice(decoded.lastIndexOf("/") + 1) || "Calendar";
}

function isReadOnly(calendar: DAVCalendar): boolean {
  const privileges = calendar.projectedProps?.currentUserPrivilegeSet;
  if (!privileges) return false;
  return !/"(write|write-content|all)"/.test(JSON.stringify(privileges));
}

async function listCalendars(credentials: CaldavCredentials): Promise<ProviderCalendar[]> {
  const calendars = await davCalendars(credentials);
  return calendars.map((calendar, index) => ({
    id: calendar.url,
    name: displayName(calendar),
    description: typeof calendar.description === "string" ? calendar.description : null,
    color: calendar.calendarColor ?? null,
    timeZone: calendar.timezone ?? null,
    primary: index === 0,
    readOnly: isReadOnly(calendar),
  }));
}

async function resolveCalendar(
  credentials: CaldavCredentials,
  calendarId: string,
): Promise<DAVCalendar> {
  const calendars = await davCalendars(credentials);
  const found = calendars.find((calendar) => calendar.url === calendarId);
  if (!found) throw new Error("Calendar not found on this CalDAV server");
  return found;
}

function icalToIso(time: ICAL.Time): string {
  return time.isDate ? time.toString() : time.toJSDate().toISOString();
}

function occurrenceKey(time: ICAL.Time): string {
  return String(time.toJSDate().getTime());
}

function eventIdFor(objectUrl: string, occurrence: string | null): string {
  return occurrence ? `${objectUrl}${OCCURRENCE_SEPARATOR}${occurrence}` : objectUrl;
}

function splitEventId(eventId: string): {
  objectUrl: string;
  occurrence: string | null;
} {
  const at = eventId.lastIndexOf(OCCURRENCE_SEPARATOR);
  const suffix = at === -1 ? "" : eventId.slice(at + 1);
  if (at === -1 || !/^-?\d+$/.test(suffix)) {
    return { objectUrl: eventId, occurrence: null };
  }
  return { objectUrl: eventId.slice(0, at), occurrence: suffix };
}

function recurrenceKeyOf(component: ICAL.Component): string | null {
  const value = component.getFirstPropertyValue("recurrence-id");
  return value instanceof ICAL.Time ? occurrenceKey(value) : null;
}

function timeProperty(component: ICAL.Component, name: string, time: ICAL.Time): ICAL.Property {
  const property = new ICAL.Property(name, component);
  property.setValue(time);
  const tzid = time.zone?.tzid;
  if (!time.isDate && tzid && tzid !== "UTC" && tzid !== "floating") {
    property.setParameter("tzid", tzid);
  }
  return property;
}

function setTime(component: ICAL.Component, name: string, time: ICAL.Time) {
  for (const property of component.getAllProperties(name)) {
    component.removeProperty(property);
  }
  component.addProperty(timeProperty(component, name, time));
}

function addTime(component: ICAL.Component, name: string, time: ICAL.Time) {
  component.addProperty(timeProperty(component, name, time));
}

function attendeeFrom(property: ICAL.Property, selfEmail: string): EventAttendee {
  const value = String(property.getFirstValue() ?? "");
  const email = value.replace(/^mailto:/i, "");
  const partstat = String(property.getParameter("partstat") ?? "NEEDS-ACTION");
  const cn = property.getParameter("cn");
  return {
    email,
    name: typeof cn === "string" ? cn : undefined,
    response: PARTSTAT_TO_RESPONSE[partstat.toUpperCase()] ?? "needsAction",
    optional: String(property.getParameter("role") ?? "").includes("OPT"),
    self: !!selfEmail && email.toLowerCase() === selfEmail.toLowerCase(),
  };
}

const PARTSTAT_TO_RESPONSE: Record<string, AttendeeResponse> = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  "NEEDS-ACTION": "needsAction",
};

const RESPONSE_TO_PARTSTAT: Record<AttendeeResponse, string> = {
  accepted: "ACCEPTED",
  declined: "DECLINED",
  tentative: "TENTATIVE",
  needsAction: "NEEDS-ACTION",
};

const STATUS_MAP: Record<string, CalendarEvent["status"]> = {
  CONFIRMED: "confirmed",
  TENTATIVE: "tentative",
  CANCELLED: "cancelled",
};

function meetingUrlFrom(component: ICAL.Component): string | undefined {
  for (const property of component.getAllProperties("conference")) {
    const value = String(property.getFirstValue() ?? "");
    if (/^https:\/\//i.test(value)) return value;
  }
  const candidates = [
    component.getFirstPropertyValue("x-google-conference"),
    component.getFirstPropertyValue("url"),
    component.getFirstPropertyValue("location"),
    component.getFirstPropertyValue("description"),
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === "string" ? candidate : "";
    const match = text.match(/https:\/\/[^\s<>"]+/);
    if (match && conferenceName(match[0])) return match[0];
  }
  return undefined;
}

function conferenceFrom(
  component: ICAL.Component,
  meetingUrl: string | undefined,
): EventConference | undefined {
  const phones = component.getAllProperties("conference").flatMap((property) => {
    const value = String(property.getFirstValue() ?? "");
    if (!/^tel:/i.test(value)) return [];
    const [number = "", ...rest] = value.replace(/^tel:/i, "").split(",");
    const label = property.getParameter("label");
    return [
      {
        number,
        label: typeof label === "string" ? label : undefined,
        pin: rest.join("") || undefined,
      },
    ];
  });
  return compactConference({ name: conferenceName(meetingUrl), phones });
}

function toCalendarEvent(
  component: ICAL.Component,
  start: ICAL.Time,
  end: ICAL.Time,
  calendar: DAVCalendar,
  id: string,
  recurring: boolean,
  selfEmail: string,
): CalendarEvent {
  const event = new ICAL.Event(component);
  const attendees = component
    .getAllProperties("attendee")
    .map((property) => attendeeFrom(property, selfEmail));
  const organizerProperty = component.getFirstProperty("organizer");
  const organizer = organizerProperty ? attendeeFrom(organizerProperty, selfEmail) : undefined;
  const status = String(component.getFirstPropertyValue("status") ?? "");
  const updated = component.getFirstPropertyValue("last-modified");
  const meetingUrl = meetingUrlFrom(component);

  return {
    id,
    calendarId: calendar.url,
    calendarName: displayName(calendar),
    title: event.summary || "(no title)",
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: icalToIso(start),
    end: icalToIso(end),
    allDay: start.isDate,
    status: STATUS_MAP[status.toUpperCase()],
    recurring,
    organizer: organizer ? { ...organizer, organizer: true } : undefined,
    attendees,
    myResponse: attendees.find((attendee) => attendee.self)?.response,
    meetingUrl,
    conference: conferenceFrom(component, meetingUrl),
    timeZone: start.zone?.tzid ?? null,
    updatedAt: updated instanceof ICAL.Time ? updated.toJSDate().toISOString() : undefined,
  };
}

function registerTimezones(root: ICAL.Component) {
  for (const timezone of root.getAllSubcomponents("vtimezone")) {
    const tzid = String(timezone.getFirstPropertyValue("tzid") ?? "");
    if (tzid && !ICAL.TimezoneService.has(tzid)) {
      ICAL.TimezoneService.register(new ICAL.Timezone(timezone));
    }
  }
}

function boundsOf(component: ICAL.Component): {
  start: ICAL.Time;
  end: ICAL.Time;
} {
  const event = new ICAL.Event(component);
  const start = event.startDate;
  return { start, end: event.endDate ?? start };
}

function overlaps(start: ICAL.Time, end: ICAL.Time, windowStart: Date, windowEnd: Date): boolean {
  return !(start.toJSDate() > windowEnd || end.toJSDate() < windowStart);
}

function findOccurrence(master: ICAL.Component, occurrence: string): ICAL.Time | null {
  const target = Number(occurrence);
  const event = new ICAL.Event(master);
  const iterator = event.iterator();
  let next = iterator.next();
  let scanned = 0;
  while (next && scanned < MAX_SCANNED_OCCURRENCES) {
    scanned += 1;
    const at = next.toJSDate().getTime();
    if (at === target) return next;
    if (at > target) return null;
    next = iterator.next();
  }
  return null;
}

function expandMaster(
  master: ICAL.Component,
  overrides: Map<string, ICAL.Component>,
  emitted: Set<string>,
  calendar: DAVCalendar,
  objectUrl: string,
  windowStart: Date,
  windowEnd: Date,
  selfEmail: string,
): CalendarEvent[] {
  const event = new ICAL.Event(master);
  const duration = event.duration;
  const iterator = event.iterator();
  const out: CalendarEvent[] = [];
  let next = iterator.next();
  let scanned = 0;

  while (next && scanned < MAX_SCANNED_OCCURRENCES && out.length < MAX_EMITTED_OCCURRENCES) {
    scanned += 1;
    if (next.toJSDate() > windowEnd) break;

    const key = occurrenceKey(next);
    const override = overrides.get(key);

    if (override) {
      emitted.add(key);
      const bounds = boundsOf(override);
      if (overlaps(bounds.start, bounds.end, windowStart, windowEnd)) {
        out.push(
          toCalendarEvent(
            override,
            bounds.start,
            bounds.end,
            calendar,
            eventIdFor(objectUrl, key),
            true,
            selfEmail,
          ),
        );
      }
    } else {
      const end = next.clone();
      end.addDuration(duration);
      if (overlaps(next, end, windowStart, windowEnd)) {
        out.push(
          toCalendarEvent(master, next, end, calendar, eventIdFor(objectUrl, key), true, selfEmail),
        );
      }
    }

    next = iterator.next();
  }

  return out;
}

function eventsFromObject(
  object: DAVCalendarObject,
  calendar: DAVCalendar,
  windowStart: Date,
  windowEnd: Date,
  selfEmail: string,
): CalendarEvent[] {
  const data = typeof object.data === "string" ? object.data : "";
  if (!data.includes("BEGIN:VEVENT")) return [];

  const { masters, overrides } = parseObject(object);
  const out: CalendarEvent[] = [];
  const emitted = new Set<string>();

  for (const master of masters) {
    if (master.hasProperty("rrule")) {
      out.push(
        ...expandMaster(
          master,
          overrides,
          emitted,
          calendar,
          object.url,
          windowStart,
          windowEnd,
          selfEmail,
        ),
      );
      continue;
    }

    const bounds = boundsOf(master);
    if (!overlaps(bounds.start, bounds.end, windowStart, windowEnd)) continue;
    const key = masters.length > 1 ? occurrenceKey(bounds.start) : null;
    out.push(
      toCalendarEvent(
        master,
        bounds.start,
        bounds.end,
        calendar,
        eventIdFor(object.url, key),
        key !== null,
        selfEmail,
      ),
    );
  }

  for (const [key, component] of overrides) {
    if (emitted.has(key)) continue;
    const bounds = boundsOf(component);
    if (!overlaps(bounds.start, bounds.end, windowStart, windowEnd)) continue;
    out.push(
      toCalendarEvent(
        component,
        bounds.start,
        bounds.end,
        calendar,
        eventIdFor(object.url, key),
        true,
        selfEmail,
      ),
    );
  }

  return out;
}

async function listEvents(
  credentials: CaldavCredentials,
  options: ListEventsOptions,
  selfEmail = "",
): Promise<EventsResponse> {
  const client = await getClient(credentials);
  const all = await davCalendars(credentials);
  const wanted = options.calendarIds?.length
    ? all.filter((calendar) => options.calendarIds?.includes(calendar.url))
    : all;

  const windowStart = new Date(options.timeMin);
  const windowEnd = new Date(options.timeMax);

  const results = await Promise.all(
    wanted.map(async (calendar) => {
      const objects = await client.fetchCalendarObjects({
        calendar,
        timeRange: { start: options.timeMin, end: options.timeMax },
        expand: true,
        fetchOptions: fetchOptions(credentials),
      });
      return objects.flatMap((object) =>
        eventsFromObject(object, calendar, windowStart, windowEnd, selfEmail),
      );
    }),
  );

  const events = results
    .flat()
    .filter((event) =>
      options.query
        ? `${event.title} ${event.description ?? ""}`
            .toLowerCase()
            .includes(options.query.toLowerCase())
        : true,
    )
    .toSorted((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return { events: options.max ? events.slice(0, options.max) : events };
}

async function fetchObject(
  credentials: CaldavCredentials,
  calendarId: string,
  objectUrl: string,
): Promise<{ calendar: DAVCalendar; object: DAVCalendarObject }> {
  const client = await getClient(credentials);
  const calendar = await resolveCalendar(credentials, calendarId);
  const [object] = await client.fetchCalendarObjects({
    calendar,
    objectUrls: [objectUrl],
    urlFilter: () => true,
    fetchOptions: fetchOptions(credentials),
  });
  if (!object) throw new Error("Event not found");
  return { calendar, object };
}

async function getEvent(
  credentials: CaldavCredentials,
  calendarId: string,
  eventId: string,
  selfEmail = "",
): Promise<CalendarEvent> {
  const { objectUrl, occurrence } = splitEventId(eventId);
  const { calendar, object } = await fetchObject(credentials, calendarId, objectUrl);

  const at = occurrence ? Number(occurrence) : null;
  const windowStart = at === null ? new Date(0) : new Date(at - 24 * 60 * 60 * 1000);
  const windowEnd = at === null ? new Date(8640000000000000) : new Date(at + 24 * 60 * 60 * 1000);

  const events = eventsFromObject(object, calendar, windowStart, windowEnd, selfEmail);
  const found = events.find((event) => event.id === eventId);
  if (!found) throw new Error("Event not found");
  return found;
}

function timeFrom(value: string, allDay: boolean, timeZone?: string): ICAL.Time {
  if (allDay) {
    return ICAL.Time.fromDateString(value.slice(0, 10));
  }
  const time = ICAL.Time.fromJSDate(new Date(value), true);
  if (timeZone) time.zone = ICAL.TimezoneService.get(timeZone) ?? time.zone;
  return time;
}

function setAttendees(component: ICAL.Component, attendees: string[]) {
  for (const property of component.getAllProperties("attendee")) {
    component.removeProperty(property);
  }
  for (const attendee of attendees) {
    const property = new ICAL.Property("attendee", component);
    property.setParameter("partstat", "NEEDS-ACTION");
    property.setParameter("rsvp", "TRUE");
    property.setValue(`mailto:${attendee}`);
    component.addProperty(property);
  }
}

function buildVEvent(draft: EventDraft, uid: string): string {
  const root = new ICAL.Component(["vcalendar", [], []]);
  root.updatePropertyWithValue("prodid", "-//Metis Suite//CalDAV//EN");
  root.updatePropertyWithValue("version", "2.0");

  const vevent = new ICAL.Component("vevent");
  const allDay = draft.allDay ?? false;

  vevent.updatePropertyWithValue("uid", uid);
  setTime(vevent, "dtstamp", ICAL.Time.now());
  vevent.updatePropertyWithValue("summary", draft.title);
  setTime(vevent, "dtstart", timeFrom(draft.start, allDay, draft.timeZone));
  setTime(vevent, "dtend", timeFrom(draft.end, allDay, draft.timeZone));
  if (draft.description) {
    vevent.updatePropertyWithValue("description", draft.description);
  }
  if (draft.location) {
    vevent.updatePropertyWithValue("location", draft.location);
  }
  setAttendees(vevent, draft.attendees ?? []);

  root.addSubcomponent(vevent);
  return root.toString();
}

async function createEvent(
  credentials: CaldavCredentials,
  draft: EventDraft,
): Promise<{ id: string; calendarId: string }> {
  const client = await getClient(credentials);
  const calendars = await davCalendars(credentials);
  const calendar = draft.calendarId
    ? await resolveCalendar(credentials, draft.calendarId)
    : calendars[0];
  if (!calendar) throw new Error("No writable calendar on this server");

  const uid = crypto.randomUUID();
  const filename = `${uid}.ics`;
  const response = await client.createCalendarObject({
    calendar,
    filename,
    iCalString: buildVEvent(draft, uid),
    fetchOptions: fetchOptions(credentials),
  });
  if (!response.ok) {
    throw new Error(`CalDAV rejected the new event (${response.status})`);
  }

  const base = calendar.url.endsWith("/") ? calendar.url : `${calendar.url}/`;
  return { id: `${base}${filename}`, calendarId: calendar.url };
}

function cloneOccurrence(master: ICAL.Component, time: ICAL.Time): ICAL.Component {
  const clone = new ICAL.Component(structuredClone(master.toJSON()));
  for (const name of ["rrule", "rdate", "exdate"]) {
    for (const property of clone.getAllProperties(name)) {
      clone.removeProperty(property);
    }
  }
  const end = time.clone();
  end.addDuration(new ICAL.Event(master).duration);
  setTime(clone, "recurrence-id", time);
  setTime(clone, "dtstart", time);
  setTime(clone, "dtend", end);
  return clone;
}

function applyPatch(component: ICAL.Component, patch: EventPatch) {
  const allDay = patch.allDay ?? new ICAL.Event(component).startDate.isDate;

  if (patch.title !== undefined) {
    component.updatePropertyWithValue("summary", patch.title);
  }
  if (patch.description !== undefined) {
    component.updatePropertyWithValue("description", patch.description);
  }
  if (patch.location !== undefined) {
    component.updatePropertyWithValue("location", patch.location);
  }
  if (patch.start !== undefined) {
    setTime(component, "dtstart", timeFrom(patch.start, allDay, patch.timeZone));
  }
  if (patch.end !== undefined) {
    setTime(component, "dtend", timeFrom(patch.end, allDay, patch.timeZone));
  }
  if (patch.attendees) setAttendees(component, patch.attendees);
  setTime(component, "last-modified", ICAL.Time.now());
}

interface ParsedObject {
  root: ICAL.Component;
  masters: ICAL.Component[];
  overrides: Map<string, ICAL.Component>;
}

function parseObject(object: DAVCalendarObject): ParsedObject {
  const data = typeof object.data === "string" ? object.data : "";
  const root = new ICAL.Component(ICAL.parse(data));
  registerTimezones(root);

  const components = root.getAllSubcomponents("vevent");
  const overrides = new Map<string, ICAL.Component>();
  for (const component of components) {
    const key = recurrenceKeyOf(component);
    if (key) overrides.set(key, component);
  }
  return {
    root,
    masters: components.filter((component) => recurrenceKeyOf(component) === null),
    overrides,
  };
}

async function putObject(
  credentials: CaldavCredentials,
  object: DAVCalendarObject,
  root: ICAL.Component,
  what: string,
) {
  const client = await getClient(credentials);
  const response = await client.updateCalendarObject({
    calendarObject: {
      url: object.url,
      etag: object.etag,
      data: root.toString(),
    },
    fetchOptions: fetchOptions(credentials),
  });
  if (!response.ok) {
    throw new Error(`CalDAV rejected the ${what} (${response.status})`);
  }
}

async function updateEvent(
  credentials: CaldavCredentials,
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  const { objectUrl, occurrence } = splitEventId(eventId);
  const { object } = await fetchObject(credentials, calendarId, objectUrl);
  const { root, masters, overrides } = parseObject(object);

  if (!occurrence) {
    const target = masters[0] ?? root.getFirstSubcomponent("vevent");
    if (!target) throw new Error("Event not found");
    applyPatch(target, patch);
    await putObject(credentials, object, root, "update");
    return;
  }

  let target = overrides.get(occurrence);
  if (!target) {
    const master = masters.find((component) => component.hasProperty("rrule"));
    if (!master) throw new Error("Event not found");
    const time = findOccurrence(master, occurrence);
    if (!time) {
      throw new Error("That occurrence is no longer part of the series");
    }
    target = cloneOccurrence(master, time);
    root.addSubcomponent(target);
  }

  applyPatch(target, patch);
  await putObject(credentials, object, root, "update");
}

async function deleteEvent(
  credentials: CaldavCredentials,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const client = await getClient(credentials);
  const { objectUrl, occurrence } = splitEventId(eventId);
  const { object } = await fetchObject(credentials, calendarId, objectUrl);

  if (occurrence) {
    const { root, masters, overrides } = parseObject(object);
    const master = masters.find((component) => component.hasProperty("rrule"));
    const override = overrides.get(occurrence);

    if (master) {
      const time = findOccurrence(master, occurrence);
      if (time) addTime(master, "exdate", time);
    }
    if (override) root.removeSubcomponent(override);

    if (master || override) {
      await putObject(credentials, object, root, "delete");
      return;
    }
  }

  const response = await client.deleteCalendarObject({
    calendarObject: { url: object.url, etag: object.etag },
    fetchOptions: fetchOptions(credentials),
  });
  if (!response.ok) {
    throw new Error(`CalDAV rejected the delete (${response.status})`);
  }
}

async function respondToEvent(
  credentials: CaldavCredentials,
  calendarId: string,
  eventId: string,
  response: AttendeeResponse,
  selfEmail: string,
): Promise<void> {
  const { objectUrl, occurrence } = splitEventId(eventId);
  const { object } = await fetchObject(credentials, calendarId, objectUrl);
  const { root, masters, overrides } = parseObject(object);

  let target = occurrence
    ? overrides.get(occurrence)
    : (masters[0] ?? root.getFirstSubcomponent("vevent") ?? undefined);
  if (!target && occurrence) {
    const master = masters.find((component) => component.hasProperty("rrule"));
    if (!master) throw new Error("Event not found");
    const time = findOccurrence(master, occurrence);
    if (!time) {
      throw new Error("That occurrence is no longer part of the series");
    }
    target = cloneOccurrence(master, time);
    root.addSubcomponent(target);
  }
  if (!target) throw new Error("Event not found");

  const me = selfEmail.toLowerCase();
  const mine = target.getAllProperties("attendee").find(
    (property) =>
      String(property.getFirstValue() ?? "")
        .replace(/^mailto:/i, "")
        .toLowerCase() === me,
  );
  if (!mine) {
    throw new BadRequestError("You are not an attendee on this event");
  }

  mine.setParameter("partstat", RESPONSE_TO_PARTSTAT[response]);
  setTime(target, "last-modified", ICAL.Time.now());

  await putObject(credentials, object, root, "response");
}

export async function caldavVerify(credentials: CaldavCredentials): Promise<void> {
  await davCalendars(credentials);
}
