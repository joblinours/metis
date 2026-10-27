import { PageHeader } from "@/components/page-header";

import { OverviewExtras } from "./_components/overview-extras";
import { StatCards } from "./_components/stat-cards";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="Overview" description="What this instance is carrying right now." />

      <div className="mt-6">
        <StatCards />
        <OverviewExtras />
      </div>
    </div>
  );
}
