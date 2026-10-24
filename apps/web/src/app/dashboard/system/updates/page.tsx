import { notFound } from "next/navigation";

import { SYSTEM_UPDATES_NAV } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";
import { updatesEnabled } from "@/dashboard/updates";

import { UpdatesView } from "./_components/updates-view";

export const dynamic = "force-dynamic";

export default function DashboardSystemUpdatesPage() {
  if (!updatesEnabled()) notFound();
  const Icon = SYSTEM_UPDATES_NAV.icon;
  return (
    <div>
      <SystemPageHeader
        eyebrow="System"
        title={SYSTEM_UPDATES_NAV.label}
        description={SYSTEM_UPDATES_NAV.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <UpdatesView />
    </div>
  );
}
