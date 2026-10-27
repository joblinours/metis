import { PageHeader } from "@/components/page-header";

import { WorkspacesView } from "./_components/workspaces-view";

export default function DashboardWorkspacesPage() {
  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="How the instance is split up and what each workspace carries."
      />

      <div className="mt-6">
        <WorkspacesView />
      </div>
    </div>
  );
}
