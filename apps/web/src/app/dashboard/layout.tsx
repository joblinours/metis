import type { Metadata } from "next";

import { SAVE_BAR_SLOT_ID } from "@/components/dashboard/system-nav";
import { MobileAsideProvider } from "@/components/mobile-aside";
import { MobileSectionBar } from "@/components/mobile-section-bar";
import { sourceInfo } from "@/source-info";

import { DashboardSidebar } from "./_components/dashboard-sidebar";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const source = sourceInfo();
  return (
    <MobileAsideProvider>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex max-w-5xl items-start gap-14 px-6 py-10 max-md:flex-col max-md:items-stretch max-md:gap-6 max-md:px-4 max-md:py-6 lg:max-w-6xl">
          <DashboardSidebar source={source} />
          <main className="min-w-0 flex-1">
            <MobileSectionBar title="Dashboard" source={source} />
            {children}
            <div id={SAVE_BAR_SLOT_ID} className="sticky bottom-4 z-40" />
          </main>
        </div>
      </div>
    </MobileAsideProvider>
  );
}
