import type { CalendarSession } from "@/calendar/session";
import type { DriveSession } from "@/drive/session";
import type { MailboxFolders } from "@/mail/provider-folders";

export function mailboxLabelDirectory(groups: MailboxFolders[]): string {
  const lines = groups.map((group) => {
    const labels = group.tags.map((t) => `${t.ref} (${t.name})`).join(", ");
    return `- ${group.mailboxEmail}: ${labels || "(none)"}`;
  });
  return `AVAILABLE LABELS (labelId (name) for setLabel):\n${lines.join("\n") || "- (none)"}`;
}

export function calendarAccountScope(session: CalendarSession): string {
  return session.isAggregate
    ? `Viewing every calendar account in this workspace (${session.accounts
        .map((a) => a.accountEmail)
        .join(", ")}).`
    : `Viewing the calendar for ${session.accounts[0]?.accountEmail}.`;
}

export function driveViewScope(session: DriveSession): string {
  return session.isAggregate
    ? `Viewing every drive in this workspace (${session.drives.map((d) => d.email).join(", ")}).`
    : `Viewing the drive for ${session.drives[0]?.email}.`;
}
