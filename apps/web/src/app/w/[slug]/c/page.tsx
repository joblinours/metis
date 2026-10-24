import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { firstCalendarSlug } from "@/calendar/session";
import { AttachResourceCard } from "@/components/attach-resource-card";
import { ALL_CALENDARS_SLUG, calendarPath } from "@/workspace/path";

export default async function CalendarIndexPage({ params }: PageProps<"/w/[slug]/c">) {
  const { slug } = await params;
  const appUser = await getAppUser(await headers(), slug);
  if (!appUser) redirect("/");
  if (!isWorkspaceUser(appUser)) redirect("/");

  const first = await firstCalendarSlug(appUser.workspaceId);
  if (first) redirect(calendarPath(slug, ALL_CALENDARS_SLUG));

  return <AttachResourceCard resource="calendar" workspaceSlug={slug} />;
}
