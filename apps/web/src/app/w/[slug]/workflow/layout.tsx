import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { WorkspaceGate } from "@/components/workspace-gate";
import { firstMailboxSlug } from "@/mail/session";
import { getWorkspaceGateData } from "@/workspace/gate";
import { onboardingPath } from "@/workspace/path";

export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/workflow">) {
  const { slug } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.twoFactorEnabled) redirect("/2fa/setup");
  if (!appUser.workspaceId || !appUser.workspaceRole) redirect("/");

  const inbox = await firstMailboxSlug(appUser.workspaceId);
  if (!inbox) {
    const gate = await getWorkspaceGateData(appUser.userId, appUser.workspaceId, "workflow");
    if (!gate.showChooser) redirect(onboardingPath(slug));
    return (
      <WorkspaceGate
        destination="workflow"
        currentName={gate.currentName}
        currentSlug={gate.currentSlug}
        workspaces={gate.workspaces}
      />
    );
  }

  return <div className="h-full min-w-0 flex-1 overflow-hidden">{children}</div>;
}
