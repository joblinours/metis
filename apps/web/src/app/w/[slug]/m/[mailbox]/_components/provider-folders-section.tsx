"use client";

import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { Button } from "@metis/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { cn } from "@metis/ui/lib/utils";
import { ChevronRight, Folder, Plus, Tag, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  folderDepths,
  type MailboxFolderGroup,
  refreshProviderFolders,
  useFolderGroups,
} from "@/hooks/use-provider-folders";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { isRecord } from "@/lib/guards";
import { orpc } from "@/lib/orpc";
import { useMailStore } from "@/store/mail-store";
import type { Email, ProviderFolder } from "@/types/mail";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";

const DROP_PREFIX = "pfolder:";

interface DropData {
  folderRef: string;
  mailboxId: string;
  name: string;
}

function dropData(value: unknown): DropData | null {
  if (!isRecord(value)) return null;
  const { folderRef, mailboxId, name } = value;
  if (typeof folderRef !== "string" || typeof mailboxId !== "string" || typeof name !== "string") {
    return null;
  }
  return { folderRef, mailboxId, name };
}

function isShown(group: MailboxFolderGroup): boolean {
  return (
    group.supportsFolders ||
    group.tags.length > 0 ||
    group.tagsNeedReconnect ||
    group.error !== undefined
  );
}

export function ProviderFoldersSection({
  activeFolderRef,
  folderHref,
}: {
  activeFolderRef: string | null;
  folderHref: (ref: string) => Route;
}) {
  const scope = useMailboxScope();
  const aggregate = scope.mailboxSlug === ALL_MAILBOXES_SLUG;
  const groups = useFolderGroups(scope).filter(isShown);
  const removeEmail = useMailStore((s) => s.removeEmail);

  useDndMonitor({
    onDragEnd({ active, over }) {
      if (typeof over?.id !== "string" || !over.id.startsWith(DROP_PREFIX)) return;
      const target = dropData(over.data.current);
      const email = (active.data.current as { email?: Email } | undefined)?.email;
      if (!target || !email) return;
      if (aggregate && email.mailboxId !== target.mailboxId) {
        toast.error("Drop the email on a folder of its own mailbox");
        return;
      }
      const request = orpc.mail.folders.move({
        ...scope,
        id: email.id,
        folderRef: target.folderRef,
      });
      removeEmail(email.id, request);
      request.then(
        () => toast.success(`Moved to ${target.name}`),
        () => toast.error(`Could not move the email to ${target.name}`),
      );
    },
  });

  if (groups.length === 0) return null;

  return (
    <div className="mb-6 px-3">
      <div className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
        Folders
      </div>
      {aggregate ? (
        <div className="space-y-1">
          {groups.map((group) => (
            <MailboxGroup
              key={group.mailboxId}
              group={group}
              activeFolderRef={activeFolderRef}
              folderHref={folderHref}
            />
          ))}
        </div>
      ) : (
        groups.map((group) => (
          <GroupBody
            key={group.mailboxId}
            group={group}
            activeFolderRef={activeFolderRef}
            folderHref={folderHref}
          />
        ))
      )}
    </div>
  );
}

function MailboxGroup({
  group,
  activeFolderRef,
  folderHref,
}: {
  group: MailboxFolderGroup;
  activeFolderRef: string | null;
  folderHref: (ref: string) => Route;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} the folders of ${group.mailboxEmail}`}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          />
        }
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
          strokeWidth={1.75}
        />
        <span className="truncate">{group.mailboxEmail}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 border-l border-border pl-1">
          <GroupBody group={group} activeFolderRef={activeFolderRef} folderHref={folderHref} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupBody({
  group,
  activeFolderRef,
  folderHref,
}: {
  group: MailboxFolderGroup;
  activeFolderRef: string | null;
  folderHref: (ref: string) => Route;
}) {
  const [adding, setAdding] = useState(false);
  const depths = folderDepths(group.folders);
  const tagsAreFolders = group.provider === "google";

  return (
    <div className="space-y-px">
      {group.folders.map((folder) => (
        <FolderRow
          key={folder.ref}
          folder={folder}
          mailboxId={group.mailboxId}
          depth={depths.get(folder.ref) ?? 0}
          active={activeFolderRef === folder.ref}
          href={folderHref(folder.ref)}
        />
      ))}
      {!tagsAreFolders &&
        group.tags.map((tag) => (
          <div
            key={tag.ref}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-[12px] text-muted-foreground"
            title="Provider label"
          >
            <Tag className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} style={{ color: tag.color }} />
            <span className="truncate">{tag.name}</span>
          </div>
        ))}
      {group.tagsNeedReconnect && (
        <p className="px-2.5 py-1 text-[11px] text-faint">
          Reconnect this account to use its labels.
        </p>
      )}
      {group.error && <p className="px-2.5 py-1 text-[11px] text-faint">{group.error}</p>}
      {group.supportsFolders &&
        (adding ? (
          <CreateFolderForm group={group} onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12px] text-faint transition-colors hover:bg-hover hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
            {tagsAreFolders ? "New label" : "New folder or label"}
          </button>
        ))}
    </div>
  );
}

function FolderRow({
  folder,
  mailboxId,
  depth,
  active,
  href,
}: {
  folder: ProviderFolder;
  mailboxId: string;
  depth: number;
  active: boolean;
  href: Route;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${DROP_PREFIX}${folder.ref}`,
    data: { folderRef: folder.ref, mailboxId, name: folder.name } satisfies DropData,
  });
  const Icon = folder.kind === "label" ? Tag : Folder;
  return (
    <Link
      ref={setNodeRef}
      href={href}
      title={folder.path}
      style={{ paddingLeft: `${10 + depth * 12}px` }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md py-1.5 pr-2.5 text-left text-[13px] transition-colors",
        active
          ? "bg-brand-soft text-primary"
          : "bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground",
        isOver && "ring-1 ring-primary",
      )}
    >
      <Icon className="h-3.75 w-3.75 shrink-0 opacity-80" strokeWidth={1.8} />
      <span className="flex-1 truncate">{folder.name}</span>
      {typeof folder.unread === "number" && folder.unread > 0 && (
        <span className="ml-auto min-w-5.5 rounded-full bg-active px-1.5 text-center text-[11px] tabular-nums text-muted-foreground">
          {folder.unread}
        </span>
      )}
    </Link>
  );
}

function CreateFolderForm({ group, onDone }: { group: MailboxFolderGroup; onDone: () => void }) {
  const scope = useMailboxScope();
  const [name, setName] = useState("");
  const [parentRef, setParentRef] = useState("");
  const [kind, setKind] = useState<"folder" | "label">("folder");
  const [saving, setSaving] = useState(false);
  const canTag = group.supportsTags && group.provider !== "google";

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      if (kind === "label" && canTag) {
        await orpc.mail.folders.createTag({ ...scope, name: trimmed, mailboxId: group.mailboxId });
      } else {
        await orpc.mail.folders.create({
          ...scope,
          name: trimmed,
          mailboxId: group.mailboxId,
          ...(parentRef ? { parentRef } : {}),
        });
      }
      refreshProviderFolders();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1 space-y-2 rounded-md border border-border bg-surface p-2">
      <div className="flex items-center gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onDone();
          }}
          placeholder={group.provider === "google" ? "Label name" : "Name"}
          autoFocus
          className="min-w-0 flex-1 rounded border border-border bg-panel px-2 py-1 text-[12px] text-foreground outline-none"
        />
        <button
          type="button"
          onClick={onDone}
          className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-hover"
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {canTag && (
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value === "label" ? "label" : "folder")}
          className="w-full rounded border border-border bg-panel px-1.5 py-1 text-[12px] text-foreground"
          aria-label="What to create"
        >
          <option value="folder">Folder</option>
          <option value="label">Label</option>
        </select>
      )}
      {kind === "folder" && group.folders.length > 0 && (
        <select
          value={parentRef}
          onChange={(e) => setParentRef(e.target.value)}
          className="w-full rounded border border-border bg-panel px-1.5 py-1 text-[12px] text-foreground"
          aria-label="Inside"
        >
          <option value="">Top level</option>
          {group.folders.map((f) => (
            <option key={f.ref} value={f.ref}>
              {f.path}
            </option>
          ))}
        </select>
      )}
      <Button size="xs" className="w-full" onClick={submit} disabled={!name.trim() || saving}>
        Create
      </Button>
    </div>
  );
}
