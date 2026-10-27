import { PageHeader } from "@/components/page-header";

import { AutomationView } from "./_components/automation-view";

export default function DashboardAutomationPage() {
  return (
    <div>
      <PageHeader title="Automation" description="Workflows and the scheduled-mail queue." />

      <div className="mt-6">
        <AutomationView />
      </div>
    </div>
  );
}
