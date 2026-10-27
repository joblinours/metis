"use client";

import { useSession } from "@/auth/client";
import { PageHeader } from "@/components/page-header";
import { SessionsSection } from "@/components/sessions-section";

import { DataExportSection } from "./_components/data-export-section";

export default function AccountSettingsPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="text-[13px] text-faint">Loading account…</div>;
  }

  const user = session?.user;

  return (
    <div>
      <PageHeader
        title="Account"
        description="Your Metis Suite account, signed-in devices and data export."
      />

      <section className="mt-8 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-medium text-foreground">Profile</h2>
        <dl className="mt-3 grid gap-3">
          <div>
            <dt className="text-[11px] uppercase tracking-[1px] text-faint">Name</dt>
            <dd className="mt-0.5 text-[13px] text-foreground">{user?.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[1px] text-faint">Email</dt>
            <dd className="mt-0.5 font-mono text-[13px] text-foreground">{user?.email || "—"}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6">
        <SessionsSection />
      </div>

      <div className="mt-6">
        <DataExportSection />
      </div>
    </div>
  );
}
