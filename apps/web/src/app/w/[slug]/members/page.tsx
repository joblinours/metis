"use client";

import { Button } from "@metis/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";

import { useMemberAdmin } from "@/components/members/member-admin";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import type { WorkspaceRole } from "@/types/workspace";
import { membersPath } from "@/workspace/path";

import { InviteMembersDialog } from "./_components/invite-members-dialog";

interface Member {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  joinedAt: Date | string;
}

interface Invite {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: Date | string;
}

export default function MembersPage() {
  const workspaceSlug = useWorkspaceSlug();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.slug === workspaceSlug);
  const { role } = useWorkspaceAccess();
  const isAdmin = role === "owner" || role === "admin";
  const membersOptions = rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug } });
  const query = useQuery(membersOptions);
  const members: Member[] | null = query.data
    ? (query.data.members ?? [])
    : query.isError
      ? []
      : null;
  const invites: Invite[] = query.data?.pendingInvites ?? [];
  async function load() {
    await refreshQuery(membersOptions.queryKey);
  }

  const admin = useMemberAdmin({
    workspaceSlug,
    workspaceName: workspace?.name ?? "this workspace",
    role,
    onChange: load,
  });

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <main className="mx-auto max-w-3xl px-6 py-10 max-md:px-4 max-md:py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
              Members
            </h1>
            <p className="mt-1 text-[13px] text-faint">
              Everyone in {workspace?.name ?? "this workspace"}.
            </p>
          </div>
          {isAdmin && workspace && (
            <InviteMembersDialog
              workspaceSlug={workspaceSlug}
              workspaceName={workspace.name}
              onInvited={load}
            />
          )}
        </div>

        {admin.error && <p className="mt-4 text-xs text-destructive-text">{admin.error}</p>}

        {members === null ? (
          <div className="mt-8 flex items-center gap-2 text-[13px] text-faint">
            <Loader2 className="size-3.5 animate-spin" />
            Loading members…
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2" aria-label="Members">
            {members.map((m) => (
              <li key={m.memberId}>
                <Link
                  href={membersPath(workspaceSlug, m.userId)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-hover"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface text-xs font-medium text-muted-foreground">
                    {(m.name || m.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.name || m.email}
                    </p>
                    <p className="truncate text-xs text-faint">{m.email}</p>
                  </div>
                  <span className="rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-[1px] text-muted-foreground">
                    {m.role}
                  </span>
                  <ChevronRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && invites.length > 0 && (
          <>
            <h2 className="mt-8 text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
              Pending invites
            </h2>
            <ul className="mt-3 flex flex-col gap-1.5" aria-label="Pending invites">
              {invites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs"
                >
                  <span className="text-muted-foreground">
                    {i.email} <span className="text-faint">· {i.role}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-faint">
                      expires {new Date(i.expiresAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={admin.busy === i.id}
                      onClick={() => admin.revoke(i)}
                      className="text-faint hover:bg-destructive/10 hover:text-destructive-text"
                      aria-label={`Revoke invite to ${i.email}`}
                    >
                      {admin.busy === i.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {admin.dialogs}
      </main>
    </div>
  );
}
