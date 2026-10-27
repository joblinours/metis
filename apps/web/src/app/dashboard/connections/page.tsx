import { PageHeader } from "@/components/page-header";

import { ConnectionsView } from "./_components/connections-view";

export default function DashboardConnectionsPage() {
  return (
    <div>
      <PageHeader
        title="Connections"
        description="Every grant on this instance and the resources hanging off it."
      />

      <div className="mt-6">
        <ConnectionsView />
      </div>
    </div>
  );
}
