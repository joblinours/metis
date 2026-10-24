import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { firstCalendarSlug } from "@/calendar/session";
import { firstDriveSlug } from "@/drive/session";
import { firstMailboxSlug } from "@/mail/session";
import { calendarRootPath, driveRootPath, mailPath, onboardingPath } from "@/workspace/path";

export default async function WorkspaceIndexPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const appUser = await getAppUser(await headers(), slug);
  if (!appUser?.workspaceId || !appUser.workspaceRole || !appUser.workspaceSlug) {
    redirect("/");
  }

  const { workspaceId, workspaceSlug } = appUser;
  const inbox = await firstMailboxSlug(workspaceId);
  if (inbox) redirect(mailPath(workspaceSlug, inbox, "inbox"));
  if (await firstCalendarSlug(workspaceId)) {
    redirect(calendarRootPath(workspaceSlug));
  }
  if (await firstDriveSlug(workspaceId)) {
    redirect(driveRootPath(workspaceSlug));
  }
  redirect(onboardingPath(workspaceSlug));
}
