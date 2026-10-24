import "server-only";
import { recordAiUsage } from "@/ai/usage";
import { drafterAgent } from "@/mastra/agents/drafter";
import { getLlm } from "@/services/llm";

import type { MailSession } from "./session";
import { SMART_REPLY_GENERATE_OPTIONS, smartReplyPrompt } from "./smart-reply-prompt";

export interface SmartReplyRequest {
  id: string;
  sender?: string;
  subject?: string;
  snippet?: string;
}

export async function generateSmartReplies(
  mail: MailSession,
  request: SmartReplyRequest,
): Promise<{ label: string; body: string }[]> {
  const body = await mail.adapter.getMessage(request.id);

  const result = await drafterAgent.generate(
    smartReplyPrompt({
      sender: request.sender,
      subject: request.subject,
      snippet: request.snippet,
      body,
    }),
    SMART_REPLY_GENERATE_OPTIONS,
  );

  recordAiUsage({
    userId: mail.userId,
    workspaceId: mail.workspaceId,
    feature: "smart-replies",
    model: getLlm().smartReply.modelId,
    usage: result.totalUsage,
    steps: result.steps?.length,
    finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
  });

  return result.object.replies;
}
