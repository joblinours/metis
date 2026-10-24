import { notFound } from "next/navigation";

import { ProviderView } from "@/components/dashboard/provider-view";
import { SYSTEM_PROVIDERS_NAV, systemProviderNav } from "@/components/dashboard/system-nav";
import { SystemPageHeader } from "@/components/dashboard/system-ui";

export function generateStaticParams() {
  return SYSTEM_PROVIDERS_NAV.map(({ provider }) => ({ provider }));
}

export default async function DashboardSystemProviderPage({
  params,
}: PageProps<"/dashboard/system/providers/[provider]">) {
  const { provider } = await params;
  const nav = systemProviderNav(provider);
  if (!nav) notFound();

  return (
    <div>
      <SystemPageHeader
        eyebrow="System · Provider"
        title={nav.label}
        description={nav.description}
        icon={<nav.Mark className="h-6 w-6" />}
      />
      <ProviderView provider={nav.provider} />
    </div>
  );
}
