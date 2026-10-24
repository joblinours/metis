"use client";

import { createContext, useMemo } from "react";

export const WorkspaceScopeContext = createContext<string | null>(null);
export const MailboxScopeContext = createContext<string | null>(null);

export function WorkspaceScopeProvider({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => workspaceSlug, [workspaceSlug]);
  return <WorkspaceScopeContext value={value}>{children}</WorkspaceScopeContext>;
}

export function MailboxScopeProvider({
  mailboxSlug,
  children,
}: {
  mailboxSlug: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => mailboxSlug, [mailboxSlug]);
  return <MailboxScopeContext value={value}>{children}</MailboxScopeContext>;
}
