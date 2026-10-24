import { z } from "zod";

import { calendarEventSchema } from "@/server/schema";
import type { CalendarEvent } from "@/types/calendar";

const KEY = "metis-pending-calendar";

export type CalendarHandoff =
  | { kind: "event"; event: CalendarEvent; edit?: boolean }
  | { kind: "draft"; attendees: string[] }
  | { kind: "only"; calendarId: string }
  | { kind: "hide"; calendarId: string };

const storedSchema = z.object({
  calendarSlug: z.string(),
  handoff: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("event"),
      event: calendarEventSchema,
      edit: z.boolean().optional(),
    }),
    z.object({ kind: z.literal("draft"), attendees: z.array(z.string()) }),
    z.object({ kind: z.literal("only"), calendarId: z.string() }),
    z.object({ kind: z.literal("hide"), calendarId: z.string() }),
  ]),
});

type Stored = z.infer<typeof storedSchema>;

let listener: ((calendarSlug: string, handoff: CalendarHandoff) => boolean) | null = null;

export function stashCalendarHandoff(calendarSlug: string, handoff: CalendarHandoff) {
  if (listener?.(calendarSlug, handoff)) return;
  try {
    const stored: Stored = { calendarSlug, handoff };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {}
}

export function takeCalendarHandoff(calendarSlug: string): CalendarHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const stored = parsed.data;
    if (stored.calendarSlug !== calendarSlug) return null;
    sessionStorage.removeItem(KEY);
    return stored.handoff;
  } catch {
    return null;
  }
}

export function listenCalendarHandoffs(
  calendarSlug: string,
  handle: (handoff: CalendarHandoff) => void,
): () => void {
  const wrapped = (slug: string, handoff: CalendarHandoff) => {
    if (slug !== calendarSlug) return false;
    handle(handoff);
    return true;
  };
  listener = wrapped;
  return () => {
    if (listener === wrapped) listener = null;
  };
}
