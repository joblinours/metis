"use client";

import { cn } from "@metis/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Loading, useSystemData } from "@/components/dashboard/system-client";
import {
  SYSTEM_INSTANCE_NAV,
  systemDriverNav,
  systemProviderNav,
} from "@/components/dashboard/system-nav";
import { ToneBadge } from "@/components/dashboard/system-ui";
import { WithVendor } from "@/components/dashboard/vendor-mark";
import { rpc } from "@/lib/orpc";
import type { SystemVendor } from "@/server/schema";

const load = rpc.dashboard.system.overview.queryOptions();

function Card({
  href,
  icon,
  label,
  badge,
  detail,
  vendor = null,
  dimmed = false,
}: {
  href: Route;
  icon: React.ReactNode;
  label: string;
  badge: React.ReactNode;
  detail: string;
  vendor?: SystemVendor | null;
  dimmed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-hover",
        dimmed && "opacity-60 hover:opacity-100",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        {badge}
      </div>
      <div className="flex items-center justify-between gap-3">
        <WithVendor vendor={vendor}>
          <span className="truncate font-mono text-[12px] text-muted-foreground">{detail}</span>
        </WithVendor>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.75}
        />
      </div>
    </Link>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-medium tracking-wide text-faint uppercase">{title}</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function plural(value: number, singular: string, many: string): string {
  return `${value} ${value === 1 ? singular : many}`;
}

export function SystemView() {
  const data = useSystemData(load);
  if (!data) return <Loading />;

  const InstanceIcon = SYSTEM_INSTANCE_NAV.icon;

  return (
    <div className="flex flex-col gap-6">
      {data.warnings.map((warning) => (
        <p
          key={warning}
          className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-[13px] text-brand-text"
        >
          {warning}
        </p>
      ))}
      <Group title="Instance">
        <Card
          href={SYSTEM_INSTANCE_NAV.href}
          icon={
            <InstanceIcon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          }
          label={SYSTEM_INSTANCE_NAV.label}
          badge={<ToneBadge tone={data.instance.badge.tone}>{data.instance.badge.label}</ToneBadge>}
          detail={data.instance.detail}
        />
      </Group>

      <Group title="Drivers">
        {data.drivers.map((entry) => {
          const nav = systemDriverNav(entry.driver);
          if (!nav) return null;
          const Icon = nav.icon;
          return (
            <Card
              key={entry.driver}
              href={nav.href}
              icon={<Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
              label={nav.label}
              badge={<ToneBadge tone={entry.badge.tone}>{entry.badge.label}</ToneBadge>}
              detail={entry.detail}
              vendor={entry.vendor}
            />
          );
        })}
      </Group>

      <Group title="Providers">
        {data.providers.map((entry) => {
          const nav = systemProviderNav(entry.provider);
          if (!nav) return null;
          const quarantined = entry.connections.quarantined;
          return (
            <Card
              key={entry.provider}
              href={nav.href}
              dimmed={!entry.configured}
              icon={<nav.Mark className="h-4 w-4 shrink-0" />}
              label={nav.label}
              badge={
                entry.configured ? (
                  <ToneBadge tone="ok">{plural(entry.entries, "entry", "entries")}</ToneBadge>
                ) : (
                  <ToneBadge tone="off">Off</ToneBadge>
                )
              }
              detail={
                quarantined > 0
                  ? `${plural(entry.connections.active, "connection", "connections")} · ${quarantined} quarantined`
                  : plural(entry.connections.active, "connection", "connections")
              }
            />
          );
        })}
      </Group>
    </div>
  );
}
