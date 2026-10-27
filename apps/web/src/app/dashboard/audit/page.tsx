import { PageHeader } from "@/components/page-header";

import { AuditView } from "./_components/audit-view";

export default function DashboardAuditPage() {
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Security-relevant changes by every user on this instance."
      />

      <div className="mt-6">
        <AuditView />
      </div>
    </div>
  );
}
