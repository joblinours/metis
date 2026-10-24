"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Layers, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountIdentity } from "@/components/account-identity";
import { RESOURCE_PROVIDER_META } from "@/components/provider-meta";
import { useWorkspacePath, useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";
import { mailboxMarkColor } from "@/mail/mailbox-color";
import type { WorkspaceMailbox } from "@/server/schema";
import { ALL_MAILBOXES_SLUG, mailPath, workspaceSettingsPath } from "@/workspace/path";

type MailboxAvatarProps = Pick<WorkspaceMailbox, "provider" | "email" | "image">;

function MailboxAvatar({
  mailbox,
  className,
  iconClassName,
}: {
  mailbox: MailboxAvatarProps;
  className: string;
  iconClassName: string;
}) {
  const { Mark, label } = RESOURCE_PROVIDER_META.mailbox[mailbox.provider];
  const [broken, setBroken] = useState(false);
  if (mailbox.image && !broken) {
    return (
      // oxlint-disable-next-line nextjs/no-img-element --avatars are data URLs / external CDN; next/image adds no value here
      <img
        src={mailbox.image}
        alt={label}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${className} object-cover`}
      />
    );
  }
  return (
    <span className={`${className} flex items-center justify-center bg-surface`}>
      <Mark className={iconClassName} />
    </span>
  );
}

export function MailboxSwitcher() {
  const { mailboxSlug, folder } = useWorkspacePath();
  const workspaceSlug = useWorkspaceSlug();
  const mailboxes: WorkspaceMailbox[] | null =
    useQuery(rpc.workspaceMailboxes.list.queryOptions({ input: { workspaceSlug } })).data
      ?.mailboxes ?? null;

  if (!mailboxes) {
    return (
      <div className="mx-3 mb-3 flex h-12 items-center gap-2 rounded-[10px] border border-border bg-surface px-3">
        <Loader2 className="h-3 w-3 animate-spin opacity-50" strokeWidth={2.4} />
      </div>
    );
  }

  const isAll = mailboxSlug === ALL_MAILBOXES_SLUG;
  const active = mailboxes.find((m) => m.slug === mailboxSlug) ?? mailboxes[0];
  const activeMeta = active ? RESOURCE_PROVIDER_META.mailbox[active.provider] : null;
  const leaf = folder ?? "inbox";
  const manageHref = workspaceSettingsPath(workspaceSlug, "mailboxes");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="mx-3 mb-3 h-12 w-[calc(100%-1.5rem)] justify-start gap-2 rounded-[10px] bg-surface px-2.5 text-left dark:bg-surface"
            aria-label="Switch mailbox"
          >
            {isAll ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-brand-soft">
                  <Layers className="h-4 w-4 text-primary" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-muted-foreground">
                    All inboxes
                  </div>
                  <div className="truncate text-[10px] text-faint">
                    {mailboxes.length} {mailboxes.length === 1 ? "mailbox" : "mailboxes"}
                  </div>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={2.1} />
              </>
            ) : active && activeMeta ? (
              <>
                <span
                  aria-hidden
                  className="h-7 w-0.5 shrink-0 rounded-full"
                  style={{ background: mailboxMarkColor(active.email) }}
                />
                <MailboxAvatar
                  mailbox={active}
                  className="h-7 w-7 shrink-0 rounded-md border border-border"
                  iconClassName="h-4 w-4"
                />
                <AccountIdentity
                  size="trigger"
                  email={active.email}
                  label={activeMeta.label}
                  server={active.server}
                />
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={2.1} />
              </>
            ) : (
              <span className="text-[12px] text-faint">Connect a mailbox</span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[1.5px] opacity-60">
            Switch mailbox
          </DropdownMenuLabel>
          {mailboxes.length > 1 && (
            <DropdownMenuItem
              render={<Link href={mailPath(workspaceSlug, ALL_MAILBOXES_SLUG, leaf)} />}
              className="flex items-center gap-2"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-soft">
                <Layers className="h-3 w-3 text-primary" strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px]">All inboxes</div>
                <div className="truncate text-[10px] text-faint">
                  Every mailbox in this workspace
                </div>
              </div>
              {isAll && <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.1} />}
            </DropdownMenuItem>
          )}
          {mailboxes.length === 0 ? (
            <div className="px-2 py-3 text-[11px] text-faint">No connected mailboxes yet.</div>
          ) : (
            mailboxes.map((box) => {
              const meta = RESOURCE_PROVIDER_META.mailbox[box.provider];
              const isActive = box.slug === mailboxSlug;
              const href = box.slug ? mailPath(workspaceSlug, box.slug, leaf) : manageHref;
              return (
                <DropdownMenuItem
                  key={box.mailboxId}
                  render={<Link href={href} />}
                  className="flex items-center gap-2"
                >
                  <span
                    aria-hidden
                    className="h-5 w-0.5 shrink-0 rounded-full"
                    style={{ background: mailboxMarkColor(box.email) }}
                  />
                  <MailboxAvatar
                    mailbox={box}
                    className="h-5 w-5 shrink-0 rounded"
                    iconClassName="h-3 w-3"
                  />
                  <AccountIdentity
                    size="compact"
                    email={box.email}
                    label={meta.label}
                    server={box.server}
                  />
                  {isActive && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.1} />
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={manageHref} />} className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.1} />
          Manage mailboxes
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
