"use client";

import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { describeUserAgent } from "@/auth/user-agent";
import { MCP_TOOL_MANIFEST } from "@/mcp/tools";
import type { AuditEvent, AuditEventPage } from "@/server/schema";
import { AUDIT_ACTION_LABELS, type AuditResourceKind } from "@/types/audit";

const RESOURCE_NAMES: Record<AuditResourceKind, string> = {
  mailbox: "Mailbox",
  calendar: "Calendar",
  drive: "Drive",
};

const TOOL_LABELS = new Map<string, string>(
  MCP_TOOL_MANIFEST.map((tool) => [tool.key, tool.label]),
);

const ROLE_NAMES: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
};

const dateTime = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function eventTitle(event: AuditEvent): string {
  if (event.resourceKind) {
    const verb = event.action === "resource.detached" ? "detached" : "removed";
    return `${RESOURCE_NAMES[event.resourceKind]} ${verb}`;
  }
  return AUDIT_ACTION_LABELS[event.action];
}

function eventSummary(event: AuditEvent): string {
  const parts: string[] = [];
  if (event.targetLabel) parts.push(event.targetLabel);
  const { detail } = event;
  if (
    event.action === "member.role_changed" &&
    typeof detail.from === "string" &&
    typeof detail.to === "string"
  ) {
    parts.push(`${ROLE_NAMES[detail.from] ?? detail.from} → ${ROLE_NAMES[detail.to] ?? detail.to}`);
  }
  if (event.action === "workspace_invite.created" && typeof detail.role === "string") {
    parts.push(`as ${detail.role}`);
  }
  const tools = detail.tools ?? detail.sensitiveTools;
  if (Array.isArray(tools) && tools.length > 0) {
    parts.push(`sensitive tools: ${tools.map((key) => TOOL_LABELS.get(key) ?? key).join(", ")}`);
  }
  if (detail.grantRevoked === true) parts.push("access revoked at the provider");
  if (typeof detail.workspacesDeleted === "number" && detail.workspacesDeleted) {
    parts.push(`${detail.workspacesDeleted} workspace(s) deleted with it`);
  }
  return parts.join(" · ");
}

function viaLabel(event: AuditEvent): string | null {
  if (event.via === "assistant") return "Workspace Assistant";
  if (event.via === "mcp") return "MCP client";
  return null;
}

export const AUDIT_PAGES = {
  input: (cursor: string | undefined) => ({ cursor }),
  initialPageParam: undefined,
  getNextPageParam: (last: AuditEventPage) => last.nextCursor ?? undefined,
};

export function AuditEventList({
  pages,
  showWorkspace = false,
  emptyText,
}: {
  pages: UseInfiniteQueryResult<InfiniteData<AuditEventPage, string | undefined>>;
  showWorkspace?: boolean;
  emptyText: string;
}) {
  const events: AuditEvent[] | null =
    pages.data?.pages.flatMap((page) => page.events) ?? (pages.isError ? [] : null);
  const error = pages.error ? pages.error.message || "Could not load activity" : null;
  const nextCursor = pages.hasNextPage;
  const loadingMore = pages.isFetchingNextPage;

  function more() {
    void pages.fetchNextPage();
  }

  if (events === null) {
    return (
      <div className="py-6 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-text">
          {error}
        </p>
      )}
      {events.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-faint">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Audit events">
          {events.map((event) => {
            const via = viaLabel(event);
            const summary = eventSummary(event);
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-foreground">
                    {eventTitle(event)}
                    {via && <Badge variant="outline">{via}</Badge>}
                  </p>
                  {summary && (
                    <p className="mt-0.5 text-[12px] break-words text-muted-foreground">
                      {summary}
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] break-words text-faint">
                    by {event.actorEmail || "a deleted account"}
                    {showWorkspace && event.workspaceName ? ` · ${event.workspaceName}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-[11px] text-faint sm:text-right">
                  <time dateTime={new Date(event.createdAt).toISOString()}>
                    {dateTime.format(new Date(event.createdAt))}
                  </time>
                  {(event.ip || event.userAgent) && (
                    <p className="mt-0.5">
                      {[event.ip, event.userAgent && describeUserAgent(event.userAgent)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor && (
        <Button variant="outline" className="mt-3" disabled={loadingMore} onClick={more}>
          {loadingMore && <Loader2 className="animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  );
}
