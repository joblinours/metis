"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
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
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { addCustomLabel, removeCustomLabel, useCustomLabels } from "@/hooks/use-custom-labels";
import { useMailboxScope, useWorkspacePath } from "@/hooks/use-workspace-path";
import { orpc, rpc } from "@/lib/orpc";
import { customLabelMark, LABEL_OPTIONS } from "@/mail/label-meta";
import type { ScheduledSendItem } from "@/server/schema";
import { useMailStore } from "@/store/mail-store";
import { CUSTOM_LABEL_COLORS, type CustomLabelColor, type MailFolder } from "@/types/mail";
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
  const activeLabel = searchParams.get("label") ?? searchParams.get("pfolder") ?? null;
  const activeFolderRef = searchParams.get("pfolder");
  const scope = useMailboxScope();
  const leafHref = (leaf: string, search = ""): Route =>
    workspaceSlug && mailboxSlug
      ? mailPath(workspaceSlug, mailboxSlug, leaf, search)
      : workspaceRootPath();

  const { setComposeOpen } = useMailStore();
  const customLabels = useCustomLabels();
  const scheduledCount =
    useQuery(
      rpc.mail.scheduledSend.list.queryOptions({
        input: scope,
        refetchInterval: (query) => untilNextDue(query.state.data?.scheduled),
        select: (data) => (data.scheduled ?? []).filter((s) => s.status === "pending").length,
      }),
    ).data ?? null;
  const [addingLabel, setAddingLabel] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<CustomLabelColor>(CUSTOM_LABEL_COLORS[0]);
  const [pendingDeleteLabel, setPendingDeleteLabel] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const currentFolder = folder ?? pathname.split("/").pop();

  async function createLabel() {
    if (!newName.trim()) return;
    try {
      const data = await orpc.mail.customLabels.create({
        ...scope,
        name: newName.trim(),
        color: newColor,
      });
      addCustomLabel(scope, data);
      setNewName("");
      setAddingLabel(false);
    } catch {}
  }

  async function confirmDeleteLabel() {
    const target = pendingDeleteLabel;
    if (!target) return;
    setPendingDeleteLabel(null);
    await orpc.mail.customLabels.delete({ ...scope, id: target.id });
    removeCustomLabel(scope, target.id);
  }

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

      <div className="mb-6 px-3">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <div className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
            Labels
          </div>
          <button
            type="button"
            onClick={() => setAddingLabel((v) => !v)}
            className="flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-hover text-faint"
            title={addingLabel ? "Cancel" : "Add custom label"}
          >
            {addingLabel ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>

        <div className="space-y-px">
          {LABEL_OPTIONS.map(({ key, name, mark }) => (
            <LabelButton
              key={key}
              name={name}
              color={mark}
              active={activeLabel === key}
              href={leafHref("inbox", `?label=${encodeURIComponent(key)}`)}
            />
          ))}

          {customLabels.map((l) => (
            <LabelButton
              key={l.id}
              name={l.name}
              color={customLabelMark(l.color)}
              active={activeLabel === l.key}
              href={leafHref("inbox", `?label=${encodeURIComponent(l.key)}`)}
              onDelete={() => setPendingDeleteLabel({ id: l.id, name: l.name })}
              custom
            />
          ))}

          {addingLabel && (
            <div className="mt-2 space-y-2 rounded-md border p-2 bg-surface border-border">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createLabel();
                  if (e.key === "Escape") setAddingLabel(false);
                }}
                placeholder="Label name"
                autoFocus
                className="w-full rounded border border-border bg-panel px-2 py-1 text-[12px] text-foreground outline-none"
              />
              <div className="flex flex-wrap gap-1">
                {CUSTOM_LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={cn(
                      "h-5 w-5 rounded-full ring-offset-1 transition-all",
                      newColor === c && "ring-2",
                    )}
                    style={{
                      background: customLabelMark(c),
                      "--tw-ring-color": customLabelMark(c),
                    }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={createLabel}
                disabled={!newName.trim()}
                className="w-full rounded-md bg-primary py-1 text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-50"
              >
                Add label
              </button>
            </div>
          )}
        </div>
      </div>

      <ProviderFoldersSection
        activeFolderRef={activeFolderRef}
        folderHref={(ref) => leafHref("inbox", `?pfolder=${encodeURIComponent(ref)}`)}
      />

      <AlertDialog
        open={pendingDeleteLabel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteLabel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this label?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteLabel
                ? `"${pendingDeleteLabel.name}" will be removed from your sidebar. Existing emails keep their other labels.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteLabel}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function LabelButton({
  name,
  color,
  active,
  href,
  onDelete,
  custom,
}: {
  name: string;
  color: string;
  active?: boolean;
  href: Route;
  onDelete?: () => void;
  custom?: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={href}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.75 text-left text-[13px] transition-colors",
          active
            ? "bg-brand-soft text-primary"
            : "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
        )}
      >
        <Tag className="h-3.75 w-3.75 opacity-90" strokeWidth={1.8} style={{ color }} />
        <span className="flex-1 truncate">{name}</span>
      </Link>
      {custom && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint transition-colors hover:bg-hover group-hover:flex pointer-coarse:flex"
          aria-label={`Delete label ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
