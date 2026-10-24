import { notFound } from "next/navigation";

import { DriverView } from "@/components/dashboard/driver-view";
import { SYSTEM_DRIVERS_NAV, systemDriverNav } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

export function generateStaticParams() {
  return SYSTEM_DRIVERS_NAV.map(({ driver }) => ({ driver }));
}

export default async function DashboardSystemDriverPage({
  params,
}: PageProps<"/dashboard/system/drivers/[driver]">) {
  const { driver } = await params;
  const nav = systemDriverNav(driver);
  if (!nav) notFound();
  const Icon = nav.icon;

  return (
    <div>
      <SystemPageHeader
        eyebrow="System · Driver"
        title={nav.label}
        description={nav.description}
        icon={<Icon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />}
      />
      <DriverView driver={nav.driver} />
    </div>
  );
}
