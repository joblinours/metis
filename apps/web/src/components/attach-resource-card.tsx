import { Button } from "@metis/ui/components/button";
import { CalendarDays, HardDrive, Inbox } from "lucide-react";
import Link from "next/link";

import { connectServers } from "@/connections";
import { workspaceSettingsPath } from "@/workspace/path";

import { providerNames, serverProviders, serversForResource } from "./provider-meta";

const COPY = {
  mailbox: {
    Icon: Inbox,
    title: "No mailbox in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} mailbox, or pick one you have already connected on your account.`,
    cta: "Go to mailbox settings",
    page: "mailboxes",
    label: "mail",
  },
  calendar: {
    Icon: CalendarDays,
    title: "No calendar in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} account, then choose which of its calendars this workspace can see.`,
    cta: "Go to calendar settings",
    page: "calendars",
    label: "account",
  },
  drive: {
    Icon: HardDrive,
    title: "No drive in this workspace",
    body: (providers: string) =>
      `Connect a ${providers} account to browse its files here, or pick one you have already connected.`,
    cta: "Go to drive settings",
    page: "drives",
    label: "account",
  },
} as const;

export function AttachResourceCard({
  resource,
  workspaceSlug,
}: {
  resource: "mailbox" | "calendar" | "drive";
  workspaceSlug: string;
}) {
  const { Icon, title, body, cta, page, label } = COPY[resource];
  const providers = providerNames(
    serverProviders(serversForResource(connectServers(), resource)),
    label,
  );

  return (
    <div className="flex min-h-full w-full flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft">
          <Icon className="h-7 w-7 text-brand-text" strokeWidth={1.6} />
        </div>

        <h1 className="mt-5 font-serif text-[22px] font-medium tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] text-muted-foreground">
          {providers
            ? body(providers)
            : `No ${resource} providers are set up yet. The instance owner adds them in the dashboard.`}
        </p>

        <Button
          className="mt-6"
          nativeButton={false}
          render={<Link href={workspaceSettingsPath(workspaceSlug, page)}>{cta}</Link>}
        />
      </div>
    </div>
  );
}
