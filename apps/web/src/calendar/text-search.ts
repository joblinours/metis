import type { TagToken } from "@/search/ast";
import { tagKey } from "@/search/ast";
import { pickText } from "@/search/pushdown";
import type { AstSearch } from "@/search/types";
import type { CalendarEvent, EventsResponse, ListEventsOptions } from "@/types/calendar";

export const EVENT_SEARCH_MAX = 250;

export interface EventAstSearch extends AstSearch<CalendarEvent> {
  timeMin: string;
  timeMax: string;
  calendarIds?: string[];
}

function eventText(tag: TagToken): { exact: boolean } | null {
  const key = tagKey(tag);
  if (key === null) return { exact: true };
  if (key === "title") return { exact: false };
  return null;
}

export async function textEventSearch(
  list: (opts: ListEventsOptions) => Promise<EventsResponse>,
  search: EventAstSearch,
): Promise<EventsResponse> {
  const picked = pickText(search.query, eventText);
  const res = await list({
    timeMin: search.timeMin,
    timeMax: search.timeMax,
    calendarIds: search.calendarIds,
    max: EVENT_SEARCH_MAX,
    query: picked.text ?? undefined,
  });
  return {
    events: await search.accept(picked.residual, res.events),
    calendarErrors: res.calendarErrors,
  };
}
