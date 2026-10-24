import { redirect } from "next/navigation";

import { workspaceSettingsPath } from "@/workspace/path";

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  redirect(workspaceSettingsPath(slug, "general"));
}
