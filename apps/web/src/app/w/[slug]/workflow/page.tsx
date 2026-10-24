import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAppUser, isWorkspaceUser } from "@/auth/session";
import { decisionEnabled } from "@/config/runtime";
import { listWorkspaceMailboxes } from "@/connections";

import { WorkflowBuilder } from "./_components/workflow-builder";

export default async function WorkflowPage({
  params,
  searchParams,
}: PageProps<"/w/[slug]/workflow">) {
  const { slug } = await params;
  const { id } = await searchParams;
  const appUser = await getAppUser(await headers(), slug);
  if (!isWorkspaceUser(appUser)) redirect("/");

  const mailboxes = await listWorkspaceMailboxes(appUser.workspaceId);

  return (
    <WorkflowBuilder
      key={typeof id === "string" ? id : "workflows"}
      mailboxes={mailboxes.map((m) => ({
        mailboxId: m.id,
        slug: m.slug,
        email: m.email,
        aiEnabled: m.policy.ai,
      }))}
      allowDecisionNodes={decisionEnabled("workflowNode")}
      initialWorkflowId={typeof id === "string" ? id : null}
    />
  );
}
