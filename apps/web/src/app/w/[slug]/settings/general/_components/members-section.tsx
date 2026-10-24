"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";

import { rpc } from "@/lib/orpc";
import type { WorkspaceSummary } from "@/server/schema";
import type { WorkspaceRole } from "@/types/workspace";
import { membersPath } from "@/workspace/path";

const SHOWN = 5;

interface Member {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
}

export function MembersSection({ workspace }: { workspace: WorkspaceSummary }) {
  const query = useQuery(
    rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug: workspace.slug } }),
  );
  const members: Member[] | null = query.data
    ? (query.data.members ?? [])
    : query.isError
      ? []
      : null;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
          Members of {workspace.name}
        </h2>
        <Link
          href={membersPath(workspace.slug)}
          className="text-[12px] text-primary hover:underline"
        >
          Manage members
        </Link>
      </div>

      {members === null ? (
        <div className="mt-3 flex items-center justify-center rounded-xl border border-border bg-surface p-6">
          <Loader2 className="h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {members.slice(0, SHOWN).map((m) => (
            <li key={m.memberId}>
              <Link
                href={membersPath(workspace.slug, m.userId)}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-hover"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface text-xs font-medium text-muted-foreground">
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
          {members.length > SHOWN && (
            <li className="px-1 text-[12px] text-faint">and {members.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
