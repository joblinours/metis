import { WorkflowRunDetailView } from "@/components/workflow-history/workflow-run-detail";

export default async function WorkflowRunPage({
  params,
}: PageProps<"/w/[slug]/workflow/history/[runId]">) {
  const { runId } = await params;
  return <WorkflowRunDetailView runId={runId} />;
}
