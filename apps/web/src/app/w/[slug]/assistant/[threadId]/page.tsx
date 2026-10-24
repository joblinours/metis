import type { UIMessage } from "ai";

import { parseUIMessages } from "@/ai/messages";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { orpc } from "@/lib/orpc.server";

export default async function AssistantThreadPage({
  params,
}: PageProps<"/w/[slug]/assistant/[threadId]">) {
  const { slug, threadId } = await params;
  let initialMessages: UIMessage[] = [];
  try {
    const result = await orpc.assistant.threadMessages({
      threadId,
      workspaceSlug: slug,
    });
    initialMessages = (await parseUIMessages(result.messages)) ?? [];
  } catch {
    initialMessages = [];
  }

  return <AssistantChat initialMessages={initialMessages} key={threadId} threadId={threadId} />;
}
