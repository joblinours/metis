"use client";

import { Button } from "@metis/ui/components/button";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  Bookmark,
  Clock,
  FileText,
  Inbox,
  MailX,
  Moon,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { useMailboxScope, useWorkspacePath } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import type { ScheduledSendItem } from "@/server/schema";
import { useMailStore } from "@/store/mail-store";
import type { MailFolder } from "@/types/mail";
import { mailPath, workspaceRootPath } from "@/workspace/path";

import { MailboxSwitcher } from "./mailbox-switcher";
import { ProviderFoldersSection } from "./provider-folders-section";

const MAILBOXES: {
  label: string;
  folder: MailFolder;
  icon: React.ElementType;
}[] = [
  { label: "Inbox", folder: "inbox", icon: Inbox },
  { label: "Sent", folder: "sent", icon: Send },
  { label: "Drafts", folder: "drafts", icon: FileText },
  { label: "Starred", folder: "starred", icon: Star },
  { label: "Trash", folder: "trash", icon: Trash2 },
];

const DUE_GRACE_MS = 5_000;
const OVERDUE_POLL_MS = 30_000;
const MAX_WAIT_MS = 5 * 60_000;

function untilNextDue(scheduled: ScheduledSendItem[] | undefined): number | false {
  const due = (scheduled ?? [])
    .filter((s) => s.status === "pending")
    .map((s) => new Date(s.scheduledFor).getTime());
  if (due.length === 0) return false;
  const wait = Math.min(...due) - Date.now();
  return wait > 0 ? Math.min(MAX_WAIT_MS, wait + DUE_GRACE_MS) : OVERDUE_POLL_MS;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspaceSlug, mailboxSlug, folder } = useWorkspacePath();
  const activeFolderRef = searchParams.get("pfolder");
  const activeLabel = activeFolderRef;
  const scope = useMailboxScope();
  const leafHref = (leaf: string, search = ""): Route =>
    workspaceSlug && mailboxSlug
      ? mailPath(workspaceSlug, mailboxSlug, leaf, search)
      : workspaceRootPath();

  const { setComposeOpen } = useMailStore();
  const scheduledCount =
    useQuery(
      rpc.mail.scheduledSend.list.queryOptions({
        input: scope,
        refetchInterval: (query) => untilNextDue(query.state.data?.scheduled),
        select: (data) => (data.scheduled ?? []).filter((s) => s.status === "pending").length,
      }),
    ).data ?? null;
  const currentFolder = folder ?? pathname.split("/").pop();

  return (
    <aside
      className="flex h-full w-full flex-col overflow-y-auto border-r py-5 bg-panel border-border"
      aria-label="Folders"
    >
      <MailboxSwitcher />

      <Button
        onClick={() => setComposeOpen(true)}
        className="mx-3 mb-5 h-10 rounded-[10px] tracking-[0.2px]"
      >
        <Plus strokeWidth={2.2} />
        Compose
      </Button>

      <SidebarSection label="Mailboxes">
        {MAILBOXES.map(({ label, folder: f, icon: Icon }) => (
          <FolderButton
            key={f}
            label={label}
            icon={<Icon className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
            active={currentFolder === f && !activeLabel}
            href={leafHref(f)}
          />
        ))}
        <FolderButton
          label="Read later"
          icon={<Bookmark className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "read-later"}
          href={leafHref("read-later")}
        />
        <FolderButton
          label="Snoozed"
          icon={<Moon className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "snoozed"}
          href={leafHref("snoozed")}
        />
        <FolderButton
          label="Scheduled"
          icon={<Clock className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "scheduled"}
          count={scheduledCount ?? undefined}
          href={leafHref("scheduled")}
        />
        <FolderButton
          label="Subscriptions"
          icon={<MailX className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "subscriptions"}
          href={leafHref("subscriptions")}
        />
        <FolderButton
          label="Archive"
          icon={<Archive className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "archive" && !activeLabel}
          href={leafHref("archive")}
        />
        <FolderButton
          label="Spam"
          icon={<ShieldAlert className="h-3.75 w-3.75 opacity-80" strokeWidth={1.8} />}
          active={currentFolder === "spam" && !activeLabel}
          href={leafHref("spam")}
        />
      </SidebarSection>

      <ProviderFoldersSection
        activeFolderRef={activeFolderRef}
        folderHref={(ref) => leafHref("inbox", `?pfolder=${encodeURIComponent(ref)}`)}
      />
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 px-3">
      <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
        {label}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function FolderButton({
  label,
  icon,
  active,
  count,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  count?: number;
  href: Route;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.75 text-left text-[13px] transition-colors",
        active
          ? "bg-brand-soft text-primary"
          : "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-auto min-w-5.5 rounded-full px-1.5 text-center text-[11px] tabular-nums",
            active ? "bg-primary/20 text-primary" : "bg-active text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
