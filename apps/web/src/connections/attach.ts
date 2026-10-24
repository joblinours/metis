import "server-only";
import { attachCalendar, getCalendar, getCalendarLink } from "./calendar-store";
import { attachDrive, getDrive, getDriveLink } from "./drive-store";
import { attachMailbox, getMailbox, getMailboxLink } from "./mailbox-store";

export type AttachResult =
  | { linkId: string; slug: string }
  | { error: string; reason: "not_found" | "conflict" };

type AttachArgs = { userId: string; workspaceId: string };

export async function attachOwnedMailbox(
  args: AttachArgs & { mailboxId: string },
): Promise<AttachResult> {
  const target = await getMailbox(args.mailboxId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Mailbox not found", reason: "not_found" };
  }
  if (await getMailboxLink(target.id, args.workspaceId)) {
    return {
      error: "That mailbox is already in this workspace",
      reason: "conflict",
    };
  }
  return attachMailbox({
    mailboxId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function attachOwnedCalendar(
  args: AttachArgs & { calendarId: string },
): Promise<AttachResult> {
  const target = await getCalendar(args.calendarId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Calendar not found", reason: "not_found" };
  }
  if (await getCalendarLink(target.id, args.workspaceId)) {
    return {
      error: "That calendar is already in this workspace",
      reason: "conflict",
    };
  }
  return attachCalendar({
    calendarId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}

export async function attachOwnedDrive(
  args: AttachArgs & { driveId: string },
): Promise<AttachResult> {
  const target = await getDrive(args.driveId, args.userId);
  if (!target || target.quarantinedAt) {
    return { error: "Drive not found", reason: "not_found" };
  }
  if (await getDriveLink(target.id, args.workspaceId)) {
    return {
      error: "That drive is already in this workspace",
      reason: "conflict",
    };
  }
  return attachDrive({
    driveId: target.id,
    email: target.email,
    workspaceId: args.workspaceId,
  });
}
