import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { firstCalendarSlug, getCalendarSession } from "@/calendar/session";
import { ScopePolicyProvider } from "@/components/scope-policy-context";
import { getWorkspacePolicy } from "@/workspace";
import { calendarPath, workspaceSettingsPath } from "@/workspace/path";
import { scopePolicy } from "@/workspace/policy";
import { calendarTitle } from "@/workspace/titles";

export async function generateMetadata({
  params,
}: LayoutProps<"/w/[slug]/c/[calendar]">): Promise<Metadata> {
  const { slug, calendar } = await params;
  const label = await calendarTitle(await headers(), slug, calendar);
  return { title: label ? `Calendar · ${label}` : "Calendar" };
}

export default async function CalendarLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/c/[calendar]">) {
  const { slug, calendar } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.workspaceId || !appUser.workspaceRole || !appUser.workspaceSlug) {
    redirect("/");
  }

  const session = await getCalendarSession(h, slug, calendar);
  if (!session) {
    const first = await firstCalendarSlug(appUser.workspaceId);
    if (first && first !== calendar) redirect(calendarPath(slug, first));
    redirect(workspaceSettingsPath(slug, "calendars"));
  }

  const workspacePolicy = await getWorkspacePolicy(appUser.workspaceId);
  if (!workspacePolicy) notFound();

  return (
    <ScopePolicyProvider policy={scopePolicy(workspacePolicy, session.accounts)}>
      <div className="min-w-0 flex-1 overflow-auto">{children}</div>
    </ScopePolicyProvider>
  );
}
