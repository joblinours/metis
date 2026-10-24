"use client";

import { Button } from "@metis/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@metis/ui/components/collapsible";
import { cn } from "@metis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  Cable,
  ChartNoAxesColumn,
  ChevronRight,
  History,
  LayoutDashboard,
  Plug,
  Settings2,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { GuardedLink } from "@/components/dashboard/guarded-link";
import {
  SYSTEM_DRIVERS_NAV,
  SYSTEM_HISTORY_NAV,
  SYSTEM_INSTANCE_NAV,
  SYSTEM_PROVIDERS_NAV,
  SYSTEM_ROOT,
  SYSTEM_UPDATES_NAV,
} from "@/components/dashboard/system-nav";
import { SourceLink } from "@/components/source-link";
import { rpc } from "@/lib/orpc";
import type { SourceInfo } from "@/source-info";
import { workspaceRootPath } from "@/workspace/path";

import { PreflightBar } from "./preflight-bar";

const DASHBOARD_NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/usage", label: "AI usage", icon: ChartNoAxesColumn },
  { href: "/dashboard/connections", label: "Connections", icon: Cable },
  { href: "/dashboard/people", label: "People", icon: UserRound },
  { href: "/dashboard/workspaces", label: "Workspaces", icon: Users },
  { href: "/dashboard/automation", label: "Automation", icon: Workflow },
  { href: "/dashboard/mcp", label: "MCP clients", icon: Plug },
  { href: "/dashboard/audit", label: "Audit log", icon: History },
] as const;

function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-1.75 text-[13px] transition-colors",
    active
      ? "bg-brand-soft text-primary"
      : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 mb-0.5 px-2.5 text-[10px] font-medium tracking-wide text-faint uppercase">
      {children}
    </p>
  );
}

function SubItem({
  href,
  label,
  icon,
  pathname,
}: {
  href: Route;
  label: string;
  icon: React.ReactNode;
  pathname: string;
}) {
  const active = pathname === href;
  return (
    <GuardedLink
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(navItemClass(active), "gap-2 py-1.25")}
    >
      {icon}
      <span className="truncate">{label}</span>
    </GuardedLink>
  );
}

function SystemNav({ pathname, updatesEnabled }: { pathname: string; updatesEnabled: boolean }) {
  const inSystem = pathname === SYSTEM_ROOT || pathname.startsWith(`${SYSTEM_ROOT}/`);
  const [open, setOpen] = useState(inSystem);
  const [wasInSystem, setWasInSystem] = useState(inSystem);

  if (inSystem !== wasInSystem) {
    setWasInSystem(inSystem);
    if (inSystem) setOpen(true);
  }

  const rootActive = pathname === SYSTEM_ROOT;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-px">
        <GuardedLink
          href={SYSTEM_ROOT}
          aria-current={rootActive ? "page" : undefined}
          className={cn(navItemClass(rootActive), "min-w-0 flex-1")}
        >
          <Settings2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">System</span>
        </GuardedLink>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={open ? "Collapse System" : "Expand System"}
              className="text-muted-foreground"
            />
          }
        >
          <ChevronRight
            className={cn("transition-transform", open && "rotate-90")}
            strokeWidth={1.75}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-px ml-4.5 flex flex-col gap-px border-l border-border pl-2">
          <SubItem
            href={SYSTEM_INSTANCE_NAV.href}
            label={SYSTEM_INSTANCE_NAV.label}
            pathname={pathname}
            icon={<SYSTEM_INSTANCE_NAV.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
          />
          <SubItem
            href={SYSTEM_HISTORY_NAV.href}
            label={SYSTEM_HISTORY_NAV.label}
            pathname={pathname}
            icon={<SYSTEM_HISTORY_NAV.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
          />
          {updatesEnabled && (
            <SubItem
              href={SYSTEM_UPDATES_NAV.href}
              label={SYSTEM_UPDATES_NAV.label}
              pathname={pathname}
              icon={<SYSTEM_UPDATES_NAV.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
            />
          )}
          <GroupHeading>Drivers</GroupHeading>
          {SYSTEM_DRIVERS_NAV.map(({ href, label, icon: Icon }) => (
            <SubItem
              key={href}
              href={href}
              label={label}
              pathname={pathname}
              icon={<Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />}
            />
          ))}
          <GroupHeading>Providers</GroupHeading>
          {SYSTEM_PROVIDERS_NAV.map(({ href, label, Mark }) => (
            <SubItem
              key={href}
              href={href}
              label={label}
              pathname={pathname}
              icon={<Mark className="h-3.5 w-3.5 shrink-0" />}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DashboardSidebar({ source }: { source: SourceInfo }) {
  const pathname = usePathname();
  const updatesEnabled =
    useQuery(rpc.dashboard.system.updatesEnabled.queryOptions()).data?.enabled ?? false;

  return (
    <aside
      className="sticky top-10 flex h-[calc(100dvh-5rem)] w-52 shrink-0 flex-col pt-1 max-md:static max-md:h-auto max-md:w-full"
      aria-label="Dashboard"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GuardedLink
          href={workspaceRootPath()}
          className="mb-4 flex items-center gap-1.5 text-[13px] text-faint transition-colors hover:text-muted-foreground"
        >
          Back
        </GuardedLink>

        <h1 className="mb-4 font-serif text-[22px] font-medium tracking-tight text-foreground">
          Dashboard
        </h1>

        <nav className="flex flex-col gap-px">
          {DASHBOARD_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <GuardedLink
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={navItemClass(active)}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{label}</span>
              </GuardedLink>
            );
          })}
          <SystemNav pathname={pathname} updatesEnabled={updatesEnabled} />
        </nav>
      </div>
      <PreflightBar />
      <SourceLink source={source} className="mt-3 shrink-0 px-2.5" />
    </aside>
  );
}
