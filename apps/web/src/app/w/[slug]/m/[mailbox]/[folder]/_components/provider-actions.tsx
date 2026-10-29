"use client";

import { Button } from "@metis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metis/ui/components/dropdown-menu";
import { ChevronDown, Folder, FolderInput, Tag } from "lucide-react";
import { toast } from "sonner";

import {
  emailTags,
  folderDepths,
  groupForEmail,
  type MailboxFolderGroup,
  useFolderGroups,
} from "@/hooks/use-provider-folders";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { mapLimit } from "@/lib/map-limit";
import { orpc } from "@/lib/orpc";
import { useMailStore } from "@/store/mail-store";
import type { Email, ProviderTag } from "@/types/mail";
import { ALL_MAILBOXES_SLUG } from "@/workspace/path";

function tagChoices(group: MailboxFolderGroup): ProviderTag[] {
  if (group.provider === "google") {
    return group.folders.map((f) => ({ ref: f.ref, name: f.path }));
  }
  return group.supportsTags ? group.tags : [];
}

function rawRef(group: MailboxFolderGroup, ref: string, aggregate: boolean): string {
  const prefix = `${group.mailboxId}:`;
  return aggregate && ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

function MoveItems({
  group,
  onPick,
}: {
  group: MailboxFolderGroup;
  onPick: (ref: string, name: string) => void;
}) {
  const depths = folderDepths(group.folders);
  return group.folders.map((folder) => (
    <DropdownMenuItem
      key={folder.ref}
      onClick={() => onPick(folder.ref, folder.name)}
      style={{ paddingLeft: `${6 + (depths.get(folder.ref) ?? 0) * 12}px` }}
    >
      {folder.kind === "label" ? (
        <Tag className="h-3 w-3" strokeWidth={2} />
      ) : (
        <Folder className="h-3 w-3" strokeWidth={2} />
      )}
      <span className="truncate">{folder.name}</span>
    </DropdownMenuItem>
  ));
}

export function MoveToFolderMenu({ email }: { email: Email }) {
  const scope = useMailboxScope();
  const groups = useFolderGroups(scope);
  const removeEmail = useMailStore((s) => s.removeEmail);
  const open = useMailStore((s) => s.providerMenu === "move");
  const setProviderMenu = useMailStore((s) => s.setProviderMenu);
  const group = groupForEmail(groups, email);
  if (!group?.supportsFolders || group.folders.length === 0) return null;

  function move(folderRef: string, name: string) {
    const request = orpc.mail.folders.move({ ...scope, id: email.id, folderRef });
    removeEmail(email.id, request);
    request.then(
      () => toast.success(`Moved to ${name}`),
      () => toast.error(`Could not move the email to ${name}`),
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => setProviderMenu(next ? "move" : null)}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Move to folder"
            className="bg-transparent text-muted-foreground dark:bg-transparent"
          >
            <FolderInput className="size-3.25" strokeWidth={2} />
            Move
            <ChevronDown className="size-2.75" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        <MoveItems group={group} onPick={move} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProviderTagsMenu({ email }: { email: Email }) {
  const scope = useMailboxScope();
  const aggregate = scope.mailboxSlug === ALL_MAILBOXES_SLUG;
  const groups = useFolderGroups(scope);
  const updateEmail = useMailStore((s) => s.updateEmail);
  const open = useMailStore((s) => s.providerMenu === "tags");
  const setProviderMenu = useMailStore((s) => s.setProviderMenu);
  const group = groupForEmail(groups, email);
  if (!group) return null;
  const choices = tagChoices(group);
  if (choices.length === 0) return null;
  const applied = new Set(emailTags(groups, email, aggregate).map((t) => t.ref));
  const groupOf = group;

  async function toggle(tag: ProviderTag, on: boolean) {
    const previous = email.labels ?? [];
    const raw = rawRef(groupOf, tag.ref, aggregate);
    updateEmail(email.id, {
      labels: on ? [...previous.filter((l) => l !== raw), raw] : previous.filter((l) => l !== raw),
    });
    try {
      await orpc.mail.folders.setTags({
        ...scope,
        ids: [email.id],
        add: on ? [tag.ref] : [],
        remove: on ? [] : [tag.ref],
      });
    } catch {
      updateEmail(email.id, { labels: previous });
      toast.error(`Could not ${on ? "add" : "remove"} the label ${tag.name}`);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={(next) => setProviderMenu(next ? "tags" : null)}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Provider labels"
            className="bg-transparent text-muted-foreground dark:bg-transparent"
          >
            <Tag className="size-3.25" strokeWidth={2} />
            Labels
            <ChevronDown className="size-2.75" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-80 w-60 overflow-y-auto">
        {choices.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag.ref}
            checked={applied.has(tag.ref)}
            onCheckedChange={(checked) => void toggle(tag, checked)}
          >
            <Tag className="h-3 w-3" strokeWidth={2} style={{ color: tag.color }} />
            <span className="truncate">{tag.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProviderTagChips({ email, max }: { email: Email; max?: number }) {
  const scope = useMailboxScope();
  const groups = useFolderGroups(scope);
  const tags = emailTags(groups, email, scope.mailboxSlug === ALL_MAILBOXES_SLUG);
  if (tags.length === 0) return null;
  const shown = max === undefined ? tags : tags.slice(0, max);
  return (
    <>
      {shown.map((tag) => (
        <span
          key={tag.ref}
          className="inline-flex max-w-32 items-center gap-1 truncate rounded-full border border-border px-1.5 text-[10px] text-muted-foreground"
          title={tag.name}
        >
          <span
            className="size-1.5 shrink-0 rounded-full bg-faint"
            style={tag.color ? { background: tag.color } : undefined}
          />
          <span className="truncate">{tag.name}</span>
        </span>
      ))}
      {shown.length < tags.length && (
        <span className="text-[10px] text-faint">+{tags.length - shown.length}</span>
      )}
    </>
  );
}

export function BulkMoveMenu({ emails, onMoved }: { emails: Email[]; onMoved: () => void }) {
  const scope = useMailboxScope();
  const groups = useFolderGroups(scope);
  const removeEmails = useMailStore((s) => s.removeEmails);
  const first = emails[0];
  const group = first ? groupForEmail(groups, first) : undefined;
  const sameMailbox = emails.every((e) => e.mailboxId === first?.mailboxId);
  if (!group?.supportsFolders || group.folders.length === 0 || !sameMailbox) return null;

  function move(folderRef: string, name: string) {
    const ids = emails.map((e) => e.id);
    const request = mapLimit(ids, 4, (id) =>
      orpc.mail.folders.move({ ...scope, id, folderRef }),
    ).then((settled) => {
      if (settled.some((r) => r.status === "rejected")) throw new Error("move failed");
      return settled.length;
    });
    removeEmails(ids, request);
    onMoved();
    request.then(
      () => toast.success(`Moved ${ids.length} to ${name}`),
      () => toast.error(`Some emails could not move to ${name}`),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="xs" className="text-[11px] text-muted-foreground">
            <FolderInput className="h-3 w-3" /> Move
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <MoveItems group={group} onPick={move} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
