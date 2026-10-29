import { z } from "zod";

import type { ProviderCalendar } from "@/connections";
import { detectZohoRegion, type ZohoRegion } from "@/connections/zoho-regions";
import { bind } from "@/lib/bind";
import { BadRequestError } from "@/lib/errors/bad-request";
import { ProviderError } from "@/lib/errors/provider-error";
import { mergeHeaders } from "@/lib/headers";
import { lenient } from "@/lib/zod";
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

export function zohoCalendar(accessToken: string, selfEmail: string): CalendarAdapter {
  return bind<CalendarAdapter, string>(
    {
      listCalendars,
      listEvents: (token, opts) => listEvents(token, opts, selfEmail),
      getEvent: (token, c, e) => getEvent(token, c, e, selfEmail),
      createEvent,
      updateEvent,
      deleteEvent,
      respondToEvent,
      searchAst: (token, search) =>
        textEventSearch((opts) => listEvents(token, opts, selfEmail), search),
    },
    accessToken,
  );
}

type Region = ZohoRegion;

const zohoAttendeeSchema = z.object({
  email: lenient(z.string()),
  dname: lenient(z.string()),
  status: lenient(z.union([z.string(), z.number()])),
  isoptional: lenient(z.boolean()),
});

const zohoEventSchema = z.object({
  uid: lenient(z.string()),
  eventid: lenient(z.string()),
  title: lenient(z.string()),
  description: lenient(z.string()),
  location: lenient(z.string()),
  start: lenient(z.string()),
  end: lenient(z.string()),
  dateandtime: lenient(
    z.object({
      start: lenient(z.string()),
      end: lenient(z.string()),
      timezone: lenient(z.string()),
    }),
  ),
  isallday: lenient(z.boolean()),
  iscancelled: lenient(z.boolean()),
  rrule: lenient(z.string()),
  organizer: lenient(z.string()),
  attendees: lenient(z.array(zohoAttendeeSchema)),
  conference_data: lenient(
    z.object({
      meetingdata: lenient(
        z.object({
          meeting_link: lenient(z.string()),
          meeting_id: lenient(z.union([z.string(), z.number()])),
        }),
      ),
    }),
  ),
  app_data: lenient(
    z.object({
      meetingdata: lenient(z.object({ meetinglink: lenient(z.string()) })),
    }),
  ),
  timezone: lenient(z.string()),
  recurrenceid: lenient(z.union([z.string(), z.number()])),
});

const zohoValueSchema = z.union([z.string(), z.number()]);

const zohoWritableSchema = z.object({
  title: lenient(z.string()),
  dateandtime: lenient(
    z.object({
      start: lenient(z.string()),
      end: lenient(z.string()),
      timezone: lenient(z.string()),
    }),
  ),
  isallday: lenient(z.boolean()),
  isprivate: lenient(z.boolean()),
  url: lenient(z.string()),
  location: lenient(z.string()),
  description: lenient(z.string()),
  color: lenient(z.string()),
  attendees: lenient(
    z.array(
      z.object({
        email: lenient(z.string()),
        zid: lenient(zohoValueSchema),
        permission: lenient(zohoValueSchema),
        attendance: lenient(zohoValueSchema),
        status: lenient(z.string()),
      }),
    ),
  ),
  group_attendees: lenient(z.array(z.object({ zid: lenient(zohoValueSchema) }))),
  reminders: lenient(
    z.array(z.object({ action: lenient(z.string()), minutes: lenient(zohoValueSchema) })),
  ),
  calendar_alarm: lenient(z.boolean()),
  transparency: lenient(zohoValueSchema),
  allowForwarding: lenient(z.boolean()),
  rrule: lenient(z.string()),
  etag: lenient(zohoValueSchema),
});

type ZohoWritable = z.infer<typeof zohoWritableSchema>;

const zohoRawEventsSchema = z.object({ events: lenient(z.array(z.unknown())) });

const zohoCalendarRowSchema = z.object({
  uid: lenient(z.string()),
  privilege: lenient(z.string()),
  name: lenient(z.string()),
  description: lenient(z.string()),
  color: lenient(z.string()),
  timezone: lenient(z.string()),
  isdefault: lenient(z.boolean()),
});

const zohoEventsSchema = z.object({ events: lenient(z.array(zohoEventSchema)) });

type ZohoAttendee = z.infer<typeof zohoAttendeeSchema>;
type ZohoEvent = z.infer<typeof zohoEventSchema>;

async function detectRegion(accessToken: string): Promise<Region> {
  return detectZohoRegion(
    accessToken,
    "calendar",
    (region) => `https://calendar.zoho.${region}/api/v1/calendars`,
  );
}

async function call<S extends z.ZodType>(
  schema: S,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<z.infer<S> | undefined> {
  const region = await detectRegion(accessToken);
  const res = await fetch(`https://calendar.zoho.${region}/api/v1${path}`, {
    ...init,
    headers: mergeHeaders(
      {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      init?.headers,
    ),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // FIXME(repro): REMOVE AFTER REPRO
    console.error(
      `[zoho-calendar] ${init?.method ?? "GET"} ${loggablePath(path)} -> ${res.status}`,
    );
    throw new ProviderError("zoho", res.status, body, "Zoho Calendar");
  }
  const text = await res.text();
  if (!text) return undefined;
  return schema.parse(JSON.parse(text));
}

// FIXME(repro): REMOVE AFTER REPRO
function loggablePath(path: string): string {
  const [base = "", query] = path.split("?", 2);
  if (!query) return base;
  const params = new URLSearchParams(query);
  params.delete("eventdata");
  const rest = params.toString();
  return rest ? `${base}?${rest}` : base;
}

function fromZohoTime(value: string): string {
  const raw = value.trim();
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{4})?$/);
  if (!match) return raw;
  const [, y, mo, d, h, mi, s, zone] = match;
  const offset = !zone || zone === "Z" ? "Z" : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}

function toZohoTime(value: string, allDay: boolean): string {
  const date = new Date(value);
  const iso = Number.isNaN(date.getTime()) ? value : date.toISOString();
  const compact = iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return allDay ? compact.slice(0, 8) : compact;
}

function toResponse(value: ZohoAttendee["status"]): AttendeeResponse | undefined {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "accepted" || raw === "1") return "accepted";
  if (raw === "declined" || raw === "2") return "declined";
  if (raw === "maybe" || raw === "tentative" || raw === "3") return "tentative";
  if (raw === "notresponded" || raw === "needs-action" || raw === "0") return "needsAction";
  return undefined;
}

function attendee(raw: ZohoAttendee): EventAttendee {
  return {
    email: raw.email ?? "",
    name: raw.dname || undefined,
    response: toResponse(raw.status),
    optional: raw.isoptional === true,
  };
}

interface EventRef {
  uid: string;
  recurrenceId?: string;
}

function encodeEventId(ref: EventRef): string {
  if (!ref.recurrenceId) return ref.uid;
  return Buffer.from(JSON.stringify([ref.uid, ref.recurrenceId]), "utf8").toString("base64url");
}

function decodeEventId(id: string): EventRef {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(id, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string"
    ) {
      return { uid: parsed[0], recurrenceId: parsed[1] };
    }
  } catch {}
  return { uid: id };
}

function recurrenceIdOf(instance: ZohoEvent): string | undefined {
  if (instance.recurrenceid !== undefined && String(instance.recurrenceid)) {
    return String(instance.recurrenceid);
  }
  const start = instance.dateandtime?.start || instance.start || "";
  if (!start) return undefined;
  if (/^\d{8}$/.test(start)) return start;
  const date = new Date(fromZohoTime(start));
  return Number.isNaN(date.getTime()) ? undefined : toZohoTime(date.toISOString(), false);
}

function expandInstances(
  series: ZohoEvent[],
  instances: ZohoEvent[],
): { raw: ZohoEvent; id: string }[] {
  const byUid = new Map(series.flatMap((raw) => (raw.uid ? [[raw.uid, raw] as const] : [])));
  const covered = new Set(instances.flatMap((inst) => (inst.uid ? [inst.uid] : [])));
  const occurrences = instances.map((inst) => {
    const base = inst.uid ? byUid.get(inst.uid) : undefined;
    const raw: ZohoEvent = base
      ? {
          ...base,
          title: inst.title ?? base.title,
          description: inst.description ?? base.description,
          location: inst.location ?? base.location,
          start: inst.start ?? base.start,
          end: inst.end ?? base.end,
          dateandtime: inst.dateandtime ?? base.dateandtime,
          isallday: inst.isallday ?? base.isallday,
          iscancelled: inst.iscancelled ?? base.iscancelled,
          attendees: inst.attendees ?? base.attendees,
          recurrenceid: inst.recurrenceid,
        }
      : inst;
    const recurrenceId = raw.rrule ? recurrenceIdOf(inst) : undefined;
    return { raw, id: encodeEventId({ uid: raw.uid ?? "", recurrenceId }) };
  });
  const singles = series
    .filter((raw) => !raw.uid || !covered.has(raw.uid))
    .map((raw) => ({ raw, id: raw.uid ?? "" }));
  return [...occurrences, ...singles];
}

function toEvent(
  raw: ZohoEvent,
  calendarId: string,
  calendarName?: string,
  selfEmail?: string,
  id: string = raw.uid ?? "",
): CalendarEvent {
  const start = raw.dateandtime?.start || raw.start || "";
  const end = raw.dateandtime?.end || raw.end || "";
  const meeting = raw.conference_data?.meetingdata;
  const meetingUrl = meeting?.meeting_link || raw.app_data?.meetingdata?.meetinglink || undefined;
  const allDay = raw.isallday === true || /^\d{8}$/.test(start);
  const me = selfEmail?.toLowerCase();
  const attendees = raw.attendees?.map((a) => {
    const mapped = attendee(a);
    return me && mapped.email.toLowerCase() === me ? { ...mapped, self: true } : mapped;
  });

  return {
    id,
    calendarId,
    calendarName,
    title: raw.title || "(no title)",
    description: raw.description || undefined,
    location: raw.location || undefined,
    start: fromZohoTime(start),
    end: fromZohoTime(end),
    allDay,
    status: raw.iscancelled === true ? "cancelled" : "confirmed",
    recurring: Boolean(raw.rrule),
    organizer: raw.organizer ? { email: raw.organizer } : undefined,
    attendees,
    myResponse: attendees?.find((a) => a.self)?.response,
    meetingUrl,
    conference: compactConference({
      name: conferenceName(meetingUrl) ?? (meeting?.meeting_link ? "Zoho Meeting" : undefined),
      meetingId: meeting?.meeting_id === undefined ? undefined : String(meeting.meeting_id),
    }),
    timeZone: raw.dateandtime?.timezone || raw.timezone || null,
  };
}

async function listCalendars(accessToken: string): Promise<ProviderCalendar[]> {
  const data = await call(
    z.object({ calendars: lenient(z.array(zohoCalendarRowSchema)) }),
    accessToken,
    "/calendars",
  );
  return (data?.calendars ?? [])
    .map((row) => {
      const id = row.uid ?? "";
      if (!id) return null;
      const privilege = (row.privilege ?? "").toLowerCase();
      return {
        id,
        name: row.name || id,
        description: row.description || null,
        color: row.color || null,
        timeZone: row.timezone || null,
        primary: row.isdefault === true,
        readOnly: privilege !== "" && privilege !== "owner",
      } satisfies ProviderCalendar;
    })
    .filter((row): row is ProviderCalendar => row !== null);
}

const MAX_RANGE_DAYS = 31;

function rangeWindows(timeMin: string, timeMax: string): [Date, Date][] {
  const start = new Date(timeMin);
  const end = new Date(timeMax);
  const step = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  const windows: [Date, Date][] = [];

  for (let from = start; from < end;) {
    const to = new Date(Math.min(from.getTime() + step, end.getTime()));
    windows.push([from, to]);
    from = to;
  }

  return windows.length > 0 ? windows : [[start, end]];
}

async function listEvents(
  accessToken: string,
  opts: ListEventsOptions,
  selfEmail?: string,
): Promise<EventsResponse> {
  const calendars = await listCalendars(accessToken);
  const wanted = opts.calendarIds
    ? calendars.filter((c) => opts.calendarIds?.includes(c.id))
    : calendars;

  const windows = rangeWindows(opts.timeMin, opts.timeMax);

  const pages = await Promise.all(
    wanted.flatMap((cal) =>
      windows.map(async ([from, to]) => {
        const range = JSON.stringify({
          start: toZohoTime(from.toISOString(), false),
          end: toZohoTime(to.toISOString(), false),
        });
        const path = `/calendars/${encodeURIComponent(cal.id)}/events?range=${encodeURIComponent(range)}`;
        const [series, instances] = await Promise.all([
          call(zohoEventsSchema, accessToken, path),
          call(zohoEventsSchema, accessToken, `${path}&byinstance=true`),
        ]);
        return expandInstances(series?.events ?? [], instances?.events ?? []).map(({ raw, id }) =>
          toEvent(raw, cal.id, cal.name, selfEmail, id),
        );
      }),
    ),
  );

  const seen = new Set<string>();
  let events = pages.flat().filter((event) => {
    const key = `${event.calendarId}:${event.id}:${event.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (opts.query) {
    const needle = opts.query.toLowerCase();
    events = events.filter((event) =>
      `${event.title} ${event.description ?? ""} ${event.location ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }

  return { events };
}

function encodeUid(uid: string): string {
  return encodeURIComponent(uid).replaceAll("%40", "@");
}

function eventPath(calendarId: string, uid: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}/events/${encodeUid(uid)}`;
}

async function readRawEvent(
  accessToken: string,
  calendarId: string,
  ref: EventRef,
): Promise<unknown> {
  const query = ref.recurrenceId ? `?recurrenceid=${encodeURIComponent(ref.recurrenceId)}` : "";
  const data = await call(
    zohoRawEventsSchema,
    accessToken,
    `${eventPath(calendarId, ref.uid)}${query}`,
  );
  const raw = data?.events?.[0];
  if (raw === undefined) throw new Error("Zoho Calendar event not found");
  return raw;
}

async function latestWritable(
  accessToken: string,
  calendarId: string,
  ref: EventRef,
): Promise<ZohoWritable & { etag: string | number }> {
  const current = zohoWritableSchema.parse(await readRawEvent(accessToken, calendarId, ref));
  const { etag } = current;
  if (etag === undefined) throw new Error("Zoho Calendar returned no etag for the event");
  return { ...current, etag };
}

function writeBody(ref: EventRef, current: ZohoWritable, changes: Record<string, unknown>) {
  return {
    ...current,
    ...(ref.recurrenceId ? { rrule: undefined } : {}),
    ...changes,
    etag: String(current.etag),
    ...(ref.recurrenceId ? { recurrenceid: ref.recurrenceId, recurrence_edittype: "only" } : {}),
  };
}

async function getEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  selfEmail?: string,
): Promise<CalendarEvent> {
  const raw = zohoEventSchema.parse(
    await readRawEvent(accessToken, calendarId, decodeEventId(eventId)),
  );
  return toEvent(raw, calendarId, undefined, selfEmail, eventId);
}

function toZohoBody(draft: EventDraft | EventPatch) {
  const body: Record<string, unknown> = {};
  if (draft.title !== undefined) body.title = draft.title;
  if (draft.description !== undefined) body.description = draft.description;
  if (draft.location !== undefined) body.location = draft.location;
  if (draft.start !== undefined && draft.end !== undefined) {
    body.dateandtime = {
      start: toZohoTime(draft.start, draft.allDay === true),
      end: toZohoTime(draft.end, draft.allDay === true),
      timezone: draft.timeZone ?? "UTC",
    };
  }
  if (draft.allDay !== undefined) body.isallday = draft.allDay;
  if (draft.attendees !== undefined) {
    body.attendees = draft.attendees.map((email) => ({
      email,
      permission: 0,
    }));
  }
  return body;
}

function eventDataPath(calendarId: string, suffix: string, body: unknown) {
  const payload = encodeURIComponent(JSON.stringify(body));
  return `/calendars/${encodeURIComponent(calendarId)}${suffix}?eventdata=${payload}`;
}

async function createEvent(
  accessToken: string,
  draft: EventDraft,
): Promise<{ id: string; calendarId: string }> {
  const calendarId =
    draft.calendarId ?? (await listCalendars(accessToken)).find((c) => c.primary)?.id;
  if (!calendarId) throw new Error("No Zoho calendar to write to");

  const data = await call(
    zohoEventsSchema,
    accessToken,
    eventDataPath(calendarId, "/events", toZohoBody(draft)),
    { method: "POST" },
  );
  const created = data?.events?.[0];
  return { id: created?.uid ?? created?.eventid ?? "", calendarId };
}

async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  patch: EventPatch,
): Promise<void> {
  const ref = decodeEventId(eventId);
  const current = await latestWritable(accessToken, calendarId, ref);
  const changes = toZohoBody(patch);
  if (patch.attendees !== undefined) {
    changes.attendees = patch.attendees.map(
      (email) =>
        current.attendees?.find((a) => a.email?.toLowerCase() === email.toLowerCase()) ?? {
          email,
          permission: 0,
        },
    );
  }
  await call(
    z.unknown(),
    accessToken,
    eventDataPath(calendarId, `/events/${encodeUid(ref.uid)}`, writeBody(ref, current, changes)),
    { method: "PUT" },
  );
}

async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const ref = decodeEventId(eventId);
  const { etag } = await latestWritable(accessToken, calendarId, ref);
  if (ref.recurrenceId) {
    await call(
      z.unknown(),
      accessToken,
      eventDataPath(calendarId, `/events/${encodeUid(ref.uid)}`, {
        uid: ref.uid,
        etag: String(etag),
        recurrenceid: ref.recurrenceId,
        recurrence_edittype: "only",
      }),
      { method: "DELETE" },
    );
    return;
  }
  await call(z.unknown(), accessToken, eventPath(calendarId, ref.uid), {
    method: "DELETE",
    headers: { etag: String(etag) },
  });
}

async function respondToEvent(): Promise<void> {
  throw new BadRequestError(
    "Zoho Calendar doesn't let guests reply through its API. Reply in Zoho Calendar or from the invitation email.",
  );
}
