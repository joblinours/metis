"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { viewerTimeZone } from "@/calendar/layout";
import { openEvent, openMail } from "@/components/search/navigate";
import { rpc } from "@/lib/orpc";
import type { EventSearchHitDto, MailSearchHitDto } from "@/server/schema";

const SHOWN = 5;

function quoted(value: string): string {
  return `"${value.replaceAll('"', "")}"`;
}

function safeDate(value: string, pattern: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format(date, pattern) : "";
}

export function MemberActivity({
  workspaceSlug,
  email,
  onNavigate,
}: {
  workspaceSlug: string;
  email: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const who = quoted(email);
  const mailQuery = useQuery(
    rpc.search.mail.queryOptions({
      input: { workspaceSlug, q: `from:${who} OR to:${who}`, timeZone },
      select: (res): MailSearchHitDto[] => res.emails.slice(0, SHOWN),
    }),
  );
  const eventsQuery = useQuery(
    rpc.search.events.queryOptions({
      input: {
        workspaceSlug,
        q: `(attendee:${who} OR organizer:${who}) after:today`,
        timeZone,
      },
      select: (res): EventSearchHitDto[] => res.events.slice(0, SHOWN),
    }),
  );
  const mail = mailQuery.data ?? (mailQuery.isError ? [] : null);
  const events = eventsQuery.data ?? (eventsQuery.isError ? [] : null);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
          <Mail className="size-3" />
          Recent mail with them
        </h3>
        {mail === null ? (
          <Loader2 className="size-3.5 animate-spin text-faint" />
        ) : mail.length === 0 ? (
          <p className="text-[12px] text-faint">No mail found.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mail.map((m) => (
              <li key={m.id}>
                <Button
                  variant="ghost"
                  className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 font-normal"
                  onClick={() => {
                    onNavigate?.();
                    openMail(router, workspaceSlug, m);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground">
                    {m.subject}
                  </span>
                  <span className="shrink-0 text-[11px] text-faint">
                    {safeDate(m.date, "MMM d")}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
          <CalendarDays className="size-3" />
          Upcoming events with them
        </h3>
        {events === null ? (
          <Loader2 className="size-3.5 animate-spin text-faint" />
        ) : events.length === 0 ? (
          <p className="text-[12px] text-faint">No upcoming events.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events.map((e) => (
              <li key={`${e.accountId}:${e.calendarId}:${e.id}`}>
                <Button
                  variant="ghost"
                  className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1.5 font-normal"
                  onClick={() => {
                    onNavigate?.();
                    openEvent(router, workspaceSlug, e);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground">
                    {e.title || "(untitled event)"}
                  </span>
                  <span className="shrink-0 text-[11px] text-faint">
                    {safeDate(e.start, "MMM d, HH:mm")}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
