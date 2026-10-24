"use client";

import { useSearchParams } from "next/navigation";

import { listSource, useEmailSource } from "@/mail/mail-cache";
import { useMailStore } from "@/store/mail-store";
import type { Email } from "@/types/mail";

import { useMailboxScope } from "./use-workspace-path";

export function useCurrentEmails(): Email[] {
  const scope = useMailboxScope();
  const folder = useMailStore((s) => s.selectedFolder);
  const view = useMailStore((s) => s.selectedView);
  const search = useMailStore((s) => s.submittedSearch);
  const tab = useMailStore(
    (s) => s.listTabs[`${scope.workspaceSlug}/${scope.mailboxSlug}/${folder}`],
  );
  const label = useSearchParams().get("label");
  const source = listSource(view === "read-later", label, tab);
  return useEmailSource(scope, folder, source, search, false).emails;
}
