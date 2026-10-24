import "server-only";
import {
  type CalendarProvider,
  type ConnectionAuthRow,
  type ProviderCalendar,
  resolveConnectionAuth,
} from "@/connections";

import { getCalendarAdapter } from "./adapter";

export async function listProviderCalendars(
  target: ConnectionAuthRow & { provider: CalendarProvider },
): Promise<ProviderCalendar[]> {
  const auth = await resolveConnectionAuth(target);
  if (!auth) {
    throw new Error("Could not authenticate that account");
  }
  return getCalendarAdapter(target.provider, auth, target.email).listCalendars();
}
