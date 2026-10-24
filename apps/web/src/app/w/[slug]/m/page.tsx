import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { AttachResourceCard } from "@/components/attach-resource-card";
import { firstMailboxSlug } from "@/mail/session";
import { mailPath } from "@/workspace/path";

export default async function MailIndexPage({ params }: PageProps<"/w/[slug]/m">) {
  const { slug } = await params;
  const appUser = await getAppUser(await headers(), slug);
  if (!appUser) redirect("/");
  if (!appUser.twoFactorEnabled) redirect("/2fa/setup");
  if (!isWorkspaceUser(appUser)) redirect("/");

  const first = await firstMailboxSlug(appUser.workspaceId);
  if (first) redirect(mailPath(slug, first, "inbox"));

  return <AttachResourceCard resource="mailbox" workspaceSlug={slug} />;
}
