"use client";

import { Button } from "@metis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Copy, Loader2, Mail, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { setPendingDraft } from "@/components/assistant/pending";
import { MemberActivity } from "@/components/members/member-activity";
import { useMemberAdmin } from "@/components/members/member-admin";
import { usePlatformPolicy } from "@/components/platform-policy-context";
import { composeMail, newEventWith } from "@/components/search/navigate";
import { personQuery } from "@/components/search/queries";
import { useWorkspaceAccess } from "@/components/workspace-access";
import { useWorkspaceSlug } from "@/hooks/use-workspace-path";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { rpc } from "@/lib/orpc";
import { refreshQuery } from "@/lib/query-client";
import { useSearchStore } from "@/store/search-store";
import type { WorkspaceRole } from "@/types/workspace";
import { assistantPath, membersPath } from "@/workspace/path";

interface Member {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  joinedAt: Date | string;
}

const ROLE_ITEMS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
] as const;

export default function MemberProfilePage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = decodeURIComponent(params.userId);
  const workspaceSlug = useWorkspaceSlug();
  const { workspaces } = useWorkspaces();
  const workspace = workspaces.find((w) => w.slug === workspaceSlug);
  const access = useWorkspaceAccess();
  const platformAi = usePlatformPolicy().ai;
  const openSearch = useSearchStore((s) => s.openSearch);
  const membersOptions = rpc.workspaces.listMembers.queryOptions({ input: { workspaceSlug } });
  const query = useQuery(membersOptions);
  const member: Member | null | undefined = query.data
    ? (query.data.members.find((m) => m.userId === userId) ?? null)
    : query.isError
      ? null
      : undefined;

  async function refresh() {
    await refreshQuery(membersOptions.queryKey);
    router.refresh();
  }

  const admin = useMemberAdmin({
    workspaceSlug,
    workspaceName: workspace?.name ?? "this workspace",
    role: access.role,
    selfUserId: access.userId,
    onChange: refresh,
  });

  if (member === undefined) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-faint" />
      </div>
    );
  }

  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <main className="mx-auto max-w-3xl px-6 py-10 max-md:px-4 max-md:py-6">
        <Link
          href={membersPath(workspaceSlug)}
          className="inline-flex items-center gap-1.5 text-[12px] text-faint hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All members
        </Link>

        {member === null ? (
          <p className="mt-8 text-[13px] text-faint">
            This person is not a member of this workspace.
          </p>
        ) : (
          <>
            <header className="mt-6 flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-linear-to-br from-active to-surface text-base font-medium text-muted-foreground">
                {(member.name || member.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-serif text-[26px] font-medium tracking-tight text-foreground">
                  {member.name || member.email}
                </h1>
                <p className="truncate text-[13px] text-faint">
                  {member.email} · {member.role} · joined{" "}
                  {new Date(member.joinedAt).toLocaleDateString()}
                </p>
              </div>
            </header>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => composeMail(router, workspaceSlug, { to: member.email })}
              >
                <Mail className="size-3.5" />
                Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => newEventWith(router, workspaceSlug, [member.email])}
              >
                <CalendarPlus className="size-3.5" />
                Invite to an event
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openSearch(personQuery(member.email))}
              >
                <Search className="size-3.5" />
                Search everything with this person
              </Button>
              {platformAi && access.workspaceAi && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPendingDraft([
                      {
                        type: "member",
                        id: member.userId,
                        label: member.name || member.email,
                        detail: member.email,
                      },
                    ]);
                    router.push(assistantPath(workspaceSlug));
                  }}
                >
                  <Sparkles className="size-3.5" />
                  Ask the assistant
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard
                    .writeText(member.email)
                    .then(() => toast.success("Email copied"))
                    .catch(() => toast.error("Could not copy"));
                }}
              >
                <Copy className="size-3.5" />
                Copy email
              </Button>
            </div>

            {(admin.canChangeRole(member) ||
              admin.canRemove(member) ||
              admin.canTransfer(member)) && (
              <section className="mt-8 rounded-xl border border-border bg-surface px-4 py-4">
                <h2 className="text-[10px] font-medium uppercase tracking-[1.5px] text-faint">
                  Manage
                </h2>
                {admin.error && <p className="mt-2 text-xs text-destructive-text">{admin.error}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {admin.canChangeRole(member) && (
                    <Select
                      items={[...ROLE_ITEMS]}
                      value={member.role}
                      disabled={admin.busy === member.memberId}
                      onValueChange={(value) => {
                        if (value === "admin" || value === "member") {
                          admin.setRole(member, value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-28" aria-label="Role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {ROLE_ITEMS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  {admin.canTransfer(member) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={admin.busy === member.memberId}
                      onClick={() => admin.transfer(member)}
                    >
                      Transfer ownership
                    </Button>
                  )}
                  {admin.canRemove(member) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={admin.busy === member.memberId}
                      onClick={() => admin.remove(member)}
                    >
                      Remove from workspace
                    </Button>
                  )}
                </div>
              </section>
            )}

            <div className="mt-8">
              <MemberActivity workspaceSlug={workspaceSlug} email={member.email} />
            </div>
          </>
        )}
        {admin.dialogs}
      </main>
    </div>
  );
}
