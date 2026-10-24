import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { ScopePolicyProvider } from "@/components/scope-policy-context";
import { firstDriveSlug, getDriveSession } from "@/drive/session";
import { getWorkspacePolicy } from "@/workspace";
import { drivePath, workspaceSettingsPath } from "@/workspace/path";
import { scopePolicy } from "@/workspace/policy";
import { driveTitle } from "@/workspace/titles";

export async function generateMetadata({
  params,
}: LayoutProps<"/w/[slug]/d/[drive]">): Promise<Metadata> {
  const { slug, drive } = await params;
  const label = await driveTitle(await headers(), slug, drive);
  return { title: label ? `Drive · ${label}` : "Drive" };
}

export default async function DriveLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/d/[drive]">) {
  const { slug, drive } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.twoFactorEnabled) redirect("/2fa/setup");
  if (!appUser.workspaceId || !appUser.workspaceRole || !appUser.workspaceSlug) {
    redirect("/");
  }

  const session = await getDriveSession(h, slug, drive);
  if (!session) {
    const first = await firstDriveSlug(appUser.workspaceId);
    if (first && first !== drive) redirect(drivePath(slug, first));
    redirect(workspaceSettingsPath(slug, "drives"));
  }

  const workspacePolicy = await getWorkspacePolicy(appUser.workspaceId);
  if (!workspacePolicy) notFound();

  return (
    <ScopePolicyProvider policy={scopePolicy(workspacePolicy, session.drives)}>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </ScopePolicyProvider>
  );
}
