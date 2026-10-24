import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { AttachResourceCard } from "@/components/attach-resource-card";
import { firstDriveSlug } from "@/drive/session";
import { drivePath } from "@/workspace/path";

export default async function DriveIndexPage({ params }: PageProps<"/w/[slug]/d">) {
  const { slug } = await params;
  const appUser = await getAppUser(await headers(), slug);
  if (!appUser) redirect("/");
  if (!appUser.twoFactorEnabled) redirect("/2fa/setup");
  if (!isWorkspaceUser(appUser)) redirect("/");

  const first = await firstDriveSlug(appUser.workspaceId);
  if (first) redirect(drivePath(slug, first));

  return <AttachResourceCard resource="drive" workspaceSlug={slug} />;
}
