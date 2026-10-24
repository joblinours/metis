import { AuditView } from "./_components/audit-view";

export default function DashboardAuditPage() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Audit log
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        Security-relevant changes by every user on this instance.
      </p>

      <div className="mt-6">
        <AuditView />
      </div>
    </div>
  );
}
