"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/auth/client";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { type WorkspaceItem, workspacesQuery } from "@/hooks/use-workspaces";
import { orpc } from "@/lib/orpc";
import { getInitials } from "@/lib/utils";
import { calendarRootPath, driveRootPath, mailPath, onboardingPath } from "@/workspace/path";

function resourceSummary(mailboxes: number, calendars: number, drives: number): string {
  const parts: string[] = [];
  if (mailboxes > 0) {
    parts.push(mailboxes === 1 ? "1 mailbox" : `${mailboxes} mailboxes`);
  }
  if (calendars > 0) {
    parts.push(calendars === 1 ? "1 calendar" : `${calendars} calendars`);
  }
  if (drives > 0) {
    parts.push(drives === 1 ? "1 drive" : `${drives} drives`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Empty";
}

function workspaceHref(w: WorkspaceItem) {
  if (w.inboxMailboxSlug) return mailPath(w.slug, w.inboxMailboxSlug, "inbox");
  if (w.firstCalendarSlug) return calendarRootPath(w.slug);
  if (w.firstDriveSlug) return driveRootPath(w.slug);
  return onboardingPath(w.slug);
}

export default function GlobalWorkspacesPage() {
  const { data: session } = useSession();
  const query = useQuery(workspacesQuery);
  const workspaces: WorkspaceItem[] | null = query.data?.workspaces ?? (query.isError ? [] : null);
  const [chosenSlug, setDefaultSlug] = useState<string | null>(null);
  const defaultSlug = chosenSlug ?? session?.user?.defaultWorkspaceSlug ?? null;
  const [saving, setSaving] = useState<string | null>(null);

  async function makeDefault(workspaceSlug: string) {
    if (saving || workspaceSlug === defaultSlug) return;
    const previous = defaultSlug;
    setSaving(workspaceSlug);
    setDefaultSlug(workspaceSlug);
    try {
      await orpc.user.setDefaultWorkspace({ workspaceSlug });
    } catch {
      setDefaultSlug(previous);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
            Workspaces
          </h1>
          <p className="mt-1 text-[13px] text-faint">
            Every workspace you belong to. Your default is where signing in takes you.
          </p>
        </div>
        <CreateWorkspaceDialog
          onCreated={(created) => {
            window.location.href = onboardingPath(created.slug);
          }}
        />
      </div>

      {!workspaces ? (
        <div className="mt-8 flex items-center gap-2 text-[13px] text-faint">
          <Loader2 className="size-3.5 animate-spin" />
          Loading workspaces…
        </div>
      ) : workspaces.length === 0 ? (
        <p className="mt-8 text-[13px] text-faint">No workspaces yet.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
          {workspaces.map((w) => {
            const href = workspaceHref(w);
            return (
              <li
                key={w.id}
                className="flex items-center border-b border-border-soft last:border-b-0"
              >
                <Link
                  href={href}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-hover"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-brand-soft text-[13px] font-medium text-primary",
                    )}
                  >
                    {w.logo ? (
                      // oxlint-disable-next-line nextjs/no-img-element --tiny data-URL logo
                      <img src={w.logo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(w.name).slice(0, 2)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {w.name}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-faint">
                      {w.slug} · {w.role}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-faint">
                    {resourceSummary(w.mailboxCount, w.calendarCount, w.driveCount)}
                  </span>
                </Link>
                <div className="shrink-0 pr-4 pl-3">
                  {defaultSlug === w.slug ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-2 py-1 text-[11px] font-medium text-primary">
                      <Check className="size-3" strokeWidth={2.2} />
                      Default
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving !== null}
                      onClick={() => makeDefault(w.slug)}
                    >
                      {saving === w.slug ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Make default"
                      )}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
