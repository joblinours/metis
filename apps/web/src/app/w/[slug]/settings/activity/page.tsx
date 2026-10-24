"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { AUDIT_PAGES, AuditEventList } from "@/components/audit-event-list";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { rpc } from "@/lib/orpc";

export default function WorkspaceActivityPage() {
  const workspaceSlug = useWorkspaceSlug();
  const { role } = useWorkspaceAccess();
  const canSee = role === "owner" || role === "admin";
  const pages = useInfiniteQuery(
    rpc.audit.workspace.infiniteOptions({
      ...AUDIT_PAGES,
      input: (cursor: string | undefined) => ({ workspaceSlug, cursor }),
      enabled: canSee,
    }),
  );

  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Activity
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        Role changes, ownership transfers, removed members, invites and detached mailboxes,
        calendars and drives in this workspace.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        {canSee ? (
          <AuditEventList pages={pages} emptyText="Nothing has happened in this workspace yet." />
        ) : (
          <p className="py-6 text-center text-[13px] text-faint">
            Only workspace owners and admins can see activity.
          </p>
        )}
      </div>
    </div>
  );
}
