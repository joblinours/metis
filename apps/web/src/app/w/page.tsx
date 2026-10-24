import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser } from "@/auth/session";
import { resolveDefaultWorkspaceSlug } from "@/workspace";
import { workspacePath } from "@/workspace/path";

export default async function WorkspaceRootPage() {
  const appUser = await getAppUser(await headers());
  if (!appUser) redirect("/");
  if (!appUser.twoFactorEnabled) redirect("/2fa/setup");

  const slug = await resolveDefaultWorkspaceSlug(
    appUser.userId,
    appUser.user.defaultWorkspaceSlug ?? null,
  );
  redirect(slug ? workspacePath(slug) : "/settings/workspaces");
}
