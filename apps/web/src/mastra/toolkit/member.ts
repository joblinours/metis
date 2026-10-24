import "server-only";
import { listEventsAcross } from "@/calendar/aggregate";

import type { WorkspaceCtx, WorkspaceMember } from "../runtime-context";
import { listDrives, searchAcross } from "./drive";

export type MailDirection = "from" | "to" | "either";

function addressed(addresses: string[] | undefined, email: string): boolean {
  const needle = email.toLowerCase();
  return (addresses ?? []).some((a) => a.toLowerCase().includes(needle));
}

export async function listMembers(ctx: WorkspaceCtx) {
  const members = await ctx.members();
  return {
    count: members.length,
    members: members.map((m) => ({
      memberId: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
    })),
  };
}

export async function findMemberMail(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { direction: MailDirection; limit: number },
) {
  const address = member.email;

  const groups = await Promise.all(
    ctx.mailboxes.map(async (m) => {
      try {
        const { emails } = await m.adapter.search(address);
        return emails.map((e) => ({
          mailboxId: m.mailboxId,
          mailbox: m.email,
          id: e.id,
          from: e.from,
          fromName: e.fromName,
          to: e.to,
          cc: e.cc,
          subject: e.subject,
          date: e.date,
          isRead: e.isRead,
          snippet: e.snippet.slice(0, 120),
        }));
      } catch {
        return [];
      }
    }),
  );

  const matched = groups
    .flat()
    .filter((e) => {
      const sent = e.from.toLowerCase().includes(address.toLowerCase());
      const received = addressed(e.to, address) || addressed(e.cc, address);
      if (args.direction === "from") return sent;
      if (args.direction === "to") return received;
      return sent || received;
    })
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, args.limit);

  return {
    member: { memberId: member.userId, name: member.name, email: address },
    direction: args.direction,
    count: matched.length,
    emails: matched.map(({ cc: _cc, ...rest }) => rest),
  };
}

export async function findMemberFiles(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { query?: string; limit: number },
) {
  const drives = ctx.drives.filter((d) => d.ownerUserId === member.userId);
  const who = {
    memberId: member.userId,
    name: member.name,
    email: member.email,
  };
  if (drives.length === 0) {
    return {
      member: who,
      drives: [],
      note: "This member has connected no drive that this workspace can see.",
    };
  }

  const listed = listDrives(drives);
  if (!args.query) return { member: who, ...listed };

  const found = await searchAcross(drives, args.query);
  return {
    member: who,
    drives: listed.drives,
    query: args.query,
    count: Math.min(found.count, args.limit),
    entries: found.entries.slice(0, args.limit),
  };
}

export async function findMemberEvents(
  ctx: WorkspaceCtx,
  member: WorkspaceMember,
  args: { timeMin: string; timeMax: string; max: number },
) {
  if (ctx.calendars.length === 0) {
    return { error: "No calendar is connected to this workspace" };
  }
  const address = member.email.toLowerCase();

  const { events, calendarErrors } = await listEventsAcross(ctx.calendars, {
    timeMin: args.timeMin,
    timeMax: args.timeMax,
    max: args.max,
  });

  const involved = events.filter(
    (e) =>
      e.organizer?.email.toLowerCase() === address ||
      (e.attendees ?? []).some((a) => a.email.toLowerCase() === address),
  );

  return {
    member: { memberId: member.userId, name: member.name, email: member.email },
    window: { timeMin: args.timeMin, timeMax: args.timeMax },
    count: involved.length,
    events: involved.map((e) => ({
      eventId: e.id,
      calendarAccountId: e.accountId,
      calendarId: e.calendarId,
      calendarName: e.calendarName,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      response: (e.attendees ?? []).find((a) => a.email.toLowerCase() === address)?.response,
      organizer: e.organizer?.email.toLowerCase() === address,
    })),
    errors: calendarErrors?.length ? calendarErrors : undefined,
  };
}
