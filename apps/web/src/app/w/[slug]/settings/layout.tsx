import type { Metadata } from "next";

import { MobileSectionBar } from "@/components/mobile-section-bar";
import { UnavailableAccountsBanner } from "@/components/unavailable-accounts-banner";

import { SettingsSidebar } from "./_components/settings-sidebar";

export const metadata: Metadata = { title: "Workspace settings" };

export default function WorkspaceSettingsLayout({ children }: LayoutProps<"/w/[slug]/settings">) {
  return (
    <div className="h-full min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl items-start gap-14 px-6 py-10 max-md:flex-col max-md:items-stretch max-md:gap-6 max-md:px-4 max-md:py-6 lg:max-w-6xl">
        <SettingsSidebar />
        <main className="min-w-0 flex-1">
          <MobileSectionBar title="Workspace" />
          <UnavailableAccountsBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
