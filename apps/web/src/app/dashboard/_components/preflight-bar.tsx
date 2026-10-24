"use client";

import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";

import { GuardedLink } from "@/components/dashboard/guarded-link";
import { SYSTEM_PREFLIGHT_NAV } from "@/components/dashboard/system-nav";
import { preflightQuery } from "@/store/preflight-store";

const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function PreflightBar() {
  const { data } = useQuery(preflightQuery);
  const pathname = usePathname();

  const run = data?.run;
  if (!run) return null;

  const count = run.warnings.length;
  const pending = count > 0 && !run.acknowledgedAt;
  const active = pathname === SYSTEM_PREFLIGHT_NAV.href;
  const Icon = count > 0 ? TriangleAlert : CircleCheck;

  return (
    <GuardedLink
      href={SYSTEM_PREFLIGHT_NAV.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mt-4 flex shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] transition-colors",
        pending
          ? "border-brand/30 bg-brand-soft text-brand-text hover:border-brand/50"
          : "border-border text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
    >
      <Icon className="mt-px h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block font-medium">
          {count === 0
            ? "Last deploy: no warnings"
            : `${count} deploy warning${count === 1 ? "" : "s"}`}
        </span>
        <span className="block text-[11px] opacity-80">
          {count > 0 && run.acknowledgedAt ? "Acknowledged · " : ""}
          {dateTime.format(new Date(run.ranAt))}
        </span>
      </span>
    </GuardedLink>
  );
}
