"use client";

import { usePathname } from "next/navigation";
import { use, useMemo } from "react";

import { MailboxScopeContext, WorkspaceScopeContext } from "@/components/workspace-scope";
import type { MailboxScope, WorkspaceScope } from "@/server/schema";
import { type ParsedWorkspacePath, parseWorkspacePath } from "@/workspace/path";

export function useWorkspacePath(): ParsedWorkspacePath & {
  pathname: string;
} {
  const pathname = usePathname();
  return useMemo(() => ({ ...parseWorkspacePath(pathname), pathname }), [pathname]);
}

export function useWorkspaceSlug(): string {
  const slug = use(WorkspaceScopeContext);
  if (!slug) {
    throw new Error("useWorkspaceSlug must be used within a workspace route");
  }
  return slug;
}

function useMailboxSlug(): string {
  const slug = use(MailboxScopeContext);
  if (!slug) {
    throw new Error("useMailboxSlug must be used within a mailbox route");
  }
  return slug;
}

export function useWorkspaceScope(): WorkspaceScope {
  const workspaceSlug = useWorkspaceSlug();
  return useMemo(() => ({ workspaceSlug }), [workspaceSlug]);
}

export function useMailboxScope(): MailboxScope {
  const workspaceSlug = useWorkspaceSlug();
  const mailboxSlug = useMailboxSlug();
  return useMemo(() => ({ workspaceSlug, mailboxSlug }), [workspaceSlug, mailboxSlug]);
}
