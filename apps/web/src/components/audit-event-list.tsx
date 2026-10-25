"use client";

import { Badge } from "@metis/ui/components/badge";
import { Button } from "@metis/ui/components/button";
import { Input } from "@metis/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import {
  type InfiniteData,
  keepPreviousData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { describeUserAgent } from "@/auth/user-agent";
import { isOneOf } from "@/lib/guards";
import { MCP_TOOL_MANIFEST } from "@/mcp/tools";
import type { AuditEvent, AuditEventPage, AuditFilter } from "@/server/schema";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_SEARCH_MAX_LENGTH,
  type AuditAction,
  auditEventTitle,
} from "@/types/audit";

const TOOL_LABELS = new Map<string, string>(
  MCP_TOOL_MANIFEST.map((tool) => [tool.key, tool.label]),
);

const ROLE_NAMES: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  member: "member",
};

const ALL_ACTIONS = "all";

const SEARCH_DEBOUNCE_MS = 300;

const dateTime = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

export function auditPages<T extends AuditFilter>(input: T) {
  return {
    input: (cursor: string | undefined) => ({ ...input, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (last: AuditEventPage) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  };
}

export function useAuditFilter() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState<AuditAction | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const filter = useMemo<AuditFilter>(
    () => ({ ...(q && { q }), ...(action && { action }) }),
    [q, action],
  );

  return { filter, text, setText, action, setAction };
}

export type AuditFilterState = ReturnType<typeof useAuditFilter>;

function AuditFilters({
  state,
  actions,
  searching,
}: {
  state: AuditFilterState;
  actions: readonly AuditAction[];
  searching: boolean;
}) {
  const items = [
    { value: ALL_ACTIONS, label: "All events" },
    ...actions.map((action) => ({ value: action, label: AUDIT_ACTION_LABELS[action] })),
  ];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
        <Input
          type="search"
          value={state.text}
          onChange={(e) => state.setText(e.target.value)}
          maxLength={AUDIT_SEARCH_MAX_LENGTH}
          placeholder="Search events"
          aria-label="Search events"
          className="h-8 pr-7 pl-7 text-[12px]"
        />
        {searching && (
          <Loader2 className="absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-faint" />
        )}
      </div>
      <Select
        items={items}
        value={state.action ?? ALL_ACTIONS}
        onValueChange={(value) => {
          if (value === ALL_ACTIONS) state.setAction(null);
          else if (isOneOf(AUDIT_ACTIONS, value)) state.setAction(value);
        }}
      >
        <SelectTrigger className="h-8 w-full text-[12px] sm:w-64" aria-label="Event type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AuditEventList({
  pages,
  filter,
  actions,
  showWorkspace = false,
  emptyText,
}: {
  pages: UseInfiniteQueryResult<InfiniteData<AuditEventPage, string | undefined>>;
  filter: AuditFilterState;
  actions: readonly AuditAction[];
  showWorkspace?: boolean;
  emptyText: string;
}) {
  const events: AuditEvent[] | null =
    pages.data?.pages.flatMap((page) => page.events) ?? (pages.isError ? [] : null);
  const error = pages.error ? pages.error.message || "Could not load activity" : null;
  const nextCursor = pages.hasNextPage;
  const loadingMore = pages.isFetchingNextPage;
  const filtered = Object.keys(filter.filter).length > 0;

  function more() {
    void pages.fetchNextPage();
  }

  return (
    <div>
      <AuditFilters
        state={filter}
        actions={actions}
        searching={pages.isFetching && !loadingMore && events !== null}
      />
      {events === null ? (
        <div className="py-6 text-center">
          <Loader2 className="mx-auto h-4 w-4 animate-spin opacity-50" />
        </div>
      ) : (
        <>
          {error && (
            <p className="mb-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-text">
              {error}
            </p>
          )}
          {events.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-faint">
              {filtered ? "No events match your search." : emptyText}
            </p>
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
                        {auditEventTitle(event.action, event.resourceKind)}
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
        </>
      )}
    </div>
  );
}
