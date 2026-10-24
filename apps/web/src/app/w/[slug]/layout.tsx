import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isOwnerEmail } from "@/auth/owner";
import { getAppUser } from "@/auth/session";
import { AppRail } from "@/components/app-rail";
import { ConnectServersProvider } from "@/components/connect-servers-context";
import { MobileAsideProvider } from "@/components/mobile-aside";
import { WorkspaceSearch } from "@/components/search/workspace-search";
import { WorkspaceAccessProvider } from "@/components/workspace-access";
import { WorkspaceScopeProvider } from "@/components/workspace-scope";
import { connectServers } from "@/connections";
import { sourceInfo } from "@/source-info";
import { getWorkspacePolicy } from "@/workspace";
import { workspaceRootPath } from "@/workspace/path";
import { workspaceAllowsAi } from "@/workspace/policy";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const h = await headers();
  const appUser = await getAppUser(h, slug);
  if (!appUser) redirect("/");
  if (!appUser.workspaceId) redirect(workspaceRootPath());

  const policy = await getWorkspacePolicy(appUser.workspaceId);
  const isOwner = isOwnerEmail(appUser.user.email);

  return (
    <WorkspaceScopeProvider workspaceSlug={slug}>
      <WorkspaceAccessProvider
        access={{
          workspaceAi: policy ? workspaceAllowsAi(policy) : false,
          role: appUser.workspaceRole ?? "member",
          userId: appUser.userId,
          isOwner,
        }}
      >
        <ConnectServersProvider servers={connectServers()}>
          <MobileAsideProvider>
            <div className="flex h-dvh overflow-hidden bg-background text-foreground">
              <AppRail user={appUser.user} isOwner={isOwner} source={sourceInfo()} />
              <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <WorkspaceSearch />
          </MobileAsideProvider>
        </ConnectServersProvider>
      </WorkspaceAccessProvider>
    </WorkspaceScopeProvider>
  );
}
