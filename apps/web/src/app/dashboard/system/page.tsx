import { SystemPageHeader } from "@/components/dashboard/system-ui";

import { SystemView } from "./_components/system-view";

export default function DashboardSystemPage() {
  return (
    <div>
      <SystemPageHeader
        title="System"
        description="What this deployment runs on, one driver and one provider per page. Each page edits its own sections."
      />
      <SystemView />
    </div>
  );
}
