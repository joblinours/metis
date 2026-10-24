import { SYSTEM_HISTORY_NAV } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

import { HistoryView } from "./_components/history-view";

export default function DashboardSystemHistoryPage() {
  const Icon = SYSTEM_HISTORY_NAV.icon;
  return (
    <div>
      <SystemPageHeader
        eyebrow="System"
        title={SYSTEM_HISTORY_NAV.label}
        description={SYSTEM_HISTORY_NAV.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <HistoryView />
    </div>
  );
}
