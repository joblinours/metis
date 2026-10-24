"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { AUDIT_PAGES, AuditEventList } from "@/components/audit-event-list";
import { rpc } from "@/lib/orpc";

export function SecurityActivitySection() {
  const pages = useInfiniteQuery(rpc.audit.mine.infiniteOptions(AUDIT_PAGES));

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-medium text-foreground">Security activity</h2>
      </div>
      <p className="mt-1 text-[12px] text-faint">
        Security-relevant changes you made, and changes other people made to your membership. Your
        server&rsquo;s operator decides how long these are kept.
      </p>
      <div className="mt-3">
        <AuditEventList pages={pages} showWorkspace emptyText="No security activity yet." />
      </div>
    </section>
  );
}
