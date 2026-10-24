"use client";

import { useInfiniteQuery } from "@tanstack/react-query";

import { AUDIT_PAGES, AuditEventList } from "@/components/audit-event-list";
import { rpc } from "@/lib/orpc";

export function AuditView() {
  const pages = useInfiniteQuery(rpc.dashboard.audit.infiniteOptions(AUDIT_PAGES));
  const retentionDays = pages.data?.pages.at(-1)?.retentionDays ?? null;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-[13px] font-medium text-foreground">All events</h2>
      <p className="mt-0.5 text-[11px] text-faint">
        {retentionDays === null
          ? "Newest first."
          : `Newest first. Events are kept for ${retentionDays} days (METIS_AUDIT_RETENTION_DAYS).`}{" "}
        Anyone with access to the database can change this log, so it is a record, not tamper-proof
        evidence.
      </p>
      <div className="mt-3">
        <AuditEventList pages={pages} showWorkspace emptyText="No audit events yet." />
      </div>
    </section>
  );
}
