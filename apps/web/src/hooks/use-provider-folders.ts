"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";
import { refreshQueries } from "@/lib/query-client";
import type { MailboxScope } from "@/server/schema";
import type { Email, ProviderFolder, ProviderTag } from "@/types/mail";

const FOLDERS_STALE_MS = 5 * 60_000;

export type MailboxFolderGroup = NonNullable<
  ReturnType<typeof useProviderFolders>["data"]
>["mailboxes"][number];

const NO_GROUPS: MailboxFolderGroup[] = [];

export function useProviderFolders(scope: MailboxScope) {
  return useQuery(
    rpc.mail.folders.list.queryOptions({ input: scope, staleTime: FOLDERS_STALE_MS }),
  );
}

export function useFolderGroups(scope: MailboxScope): MailboxFolderGroup[] {
  return useProviderFolders(scope).data?.mailboxes ?? NO_GROUPS;
}

export function refreshProviderFolders() {
  void refreshQueries(rpc.mail.folders.list.key());
}

export function groupForEmail(
  groups: MailboxFolderGroup[],
  email: Pick<Email, "mailboxId">,
): MailboxFolderGroup | undefined {
  return email.mailboxId ? groups.find((g) => g.mailboxId === email.mailboxId) : groups[0];
}

export function emailTags(
  groups: MailboxFolderGroup[],
  email: Pick<Email, "mailboxId" | "labels">,
  aggregate: boolean,
): ProviderTag[] {
  const group = groupForEmail(groups, email);
  if (!group) return [];
  const tags = new Map<string, ProviderTag>();
  for (const tag of group.tags) tags.set(tag.ref, tag);
  for (const folder of group.folders) {
    if (folder.kind === "label" && !tags.has(folder.ref)) {
      tags.set(folder.ref, { ref: folder.ref, name: folder.path });
    }
  }
  return (email.labels ?? []).flatMap((label) => {
    const tag = tags.get(aggregate ? `${group.mailboxId}:${label}` : label);
    return tag ? [tag] : [];
  });
}

export function folderByRef(
  groups: MailboxFolderGroup[],
  ref: string,
): { group: MailboxFolderGroup; folder: ProviderFolder } | null {
  for (const group of groups) {
    const folder = group.folders.find((f) => f.ref === ref);
    if (folder) return { group, folder };
  }
  return null;
}

export function folderDepths(folders: ProviderFolder[]): Map<string, number> {
  const byRef = new Map(folders.map((f) => [f.ref, f]));
  const depths = new Map<string, number>();
  const depthOf = (folder: ProviderFolder, guard = 0): number => {
    const known = depths.get(folder.ref);
    if (known !== undefined) return known;
    const parent = folder.parentRef ? byRef.get(folder.parentRef) : undefined;
    const depth = parent && guard < 10 ? depthOf(parent, guard + 1) + 1 : 0;
    depths.set(folder.ref, depth);
    return depth;
  };
  for (const folder of folders) depthOf(folder);
  return depths;
}
