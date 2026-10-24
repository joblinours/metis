import { SYSTEM_PREFLIGHT_NAV } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

import { PreflightView } from "./_components/preflight-view";

export default function DashboardSystemPreflightPage() {
  const Icon = SYSTEM_PREFLIGHT_NAV.icon;
  return (
    <div>
      <SystemPageHeader
        eyebrow="System"
        title={SYSTEM_PREFLIGHT_NAV.label}
        description={SYSTEM_PREFLIGHT_NAV.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <PreflightView />
    </div>
  );
}
