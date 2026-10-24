import { InstanceView } from "@/components/dashboard/instance-view";
import { SYSTEM_INSTANCE_NAV } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

export default function DashboardSystemInstancePage() {
  const Icon = SYSTEM_INSTANCE_NAV.icon;
  return (
    <div>
      <SystemPageHeader
        eyebrow="System"
        title={SYSTEM_INSTANCE_NAV.label}
        description={SYSTEM_INSTANCE_NAV.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <InstanceView />
    </div>
  );
}
