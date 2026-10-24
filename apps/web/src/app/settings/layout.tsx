import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { ConnectServersProvider } from "@/components/connect-servers-context";
import { UnavailableAccountsBanner } from "@/components/unavailable-accounts-banner";
import { connectServers } from "@/connections";
import { sourceInfo } from "@/source-info";

import { SettingsSidebar } from "./_components/settings-sidebar";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const h = await headers();
  const appUser = await getAppUser(h);
  if (!appUser) redirect("/");
  return (
    <ConnectServersProvider servers={connectServers()}>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex max-w-5xl items-start gap-14 px-6 py-10 max-md:flex-col max-md:items-stretch max-md:gap-6 max-md:px-4 max-md:py-6 lg:max-w-6xl">
          <SettingsSidebar source={sourceInfo()} />
          <main className="min-w-0 flex-1">
            <UnavailableAccountsBanner />
            {children}
          </main>
        </div>
      </div>
    </ConnectServersProvider>
  );
}
