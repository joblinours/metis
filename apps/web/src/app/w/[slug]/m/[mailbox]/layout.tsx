import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { MailImageProxyProvider } from "@/components/mail-privacy-context";
import { ScopePolicyProvider } from "@/components/scope-policy-context";
import { WorkspaceGate } from "@/components/workspace-gate";
import { MailboxScopeProvider } from "@/components/workspace-scope";
import { getInstanceConfig } from "@/config/runtime";
import { firstMailboxSlug, getMailSession } from "@/mail/session";
import { getWorkspacePolicy } from "@/workspace";
import { getWorkspaceGateData } from "@/workspace/gate";
import { mailPath, onboardingPath } from "@/workspace/path";
import { scopePolicy } from "@/workspace/policy";
import { mailboxTitle } from "@/workspace/titles";

import { MailShell } from "./_components/mail-shell";

export async function generateMetadata({
  params,
}: LayoutProps<"/w/[slug]/m/[mailbox]">): Promise<Metadata> {
  const { slug, mailbox } = await params;
  const label = await mailboxTitle(await headers(), slug, mailbox);
  if (!label) return {};
  return { title: { template: `%s · ${label} • Metis Suite`, default: label } };
}

export default async function MailLayout({
  children,
  params,
}: LayoutProps<"/w/[slug]/m/[mailbox]">) {
  const { slug, mailbox } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.workspaceId || !appUser.workspaceRole || !appUser.workspaceSlug) {
    redirect("/");
  }

  const session = await getMailSession(h, slug, mailbox);
  if (!session) {
    const inbox = await firstMailboxSlug(appUser.workspaceId);
    if (inbox) redirect(mailPath(slug, inbox, "inbox"));
    const gate = await getWorkspaceGateData(appUser.userId, appUser.workspaceId, "mail");
    if (!gate.showChooser) redirect(onboardingPath(slug));
    return (
      <WorkspaceGate
        destination="mail"
        currentName={gate.currentName}
        currentSlug={gate.currentSlug}
        workspaces={gate.workspaces}
      />
    );
  }

  const workspacePolicy = await getWorkspacePolicy(appUser.workspaceId);
  if (!workspacePolicy) notFound();

  return (
    <MailboxScopeProvider mailboxSlug={mailbox}>
      <ScopePolicyProvider policy={scopePolicy(workspacePolicy, session.mailboxes)}>
        <MailImageProxyProvider enabled={getInstanceConfig().imageProxy.enabled}>
          <MailShell>{children}</MailShell>
        </MailImageProxyProvider>
      </ScopePolicyProvider>
    </MailboxScopeProvider>
  );
}
