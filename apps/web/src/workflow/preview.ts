import "server-only";
import { recordAiUsage } from "@/ai/usage";
import { type MailScope, policyForMailbox } from "@/mail/session";
import { decideOne, decisionEnabled, decisionUsageProvider } from "@/services/decision";
import { enforceRateLimit } from "@/services/rate-limit";
import type { Email } from "@/types/mail";

import {
  buildDecisionState,
  type DecisionAnswer,
  needsFullFacts,
  toDecisionAnswer,
  wireQuestion,
} from "./decision";
import { factsFromEmail } from "./nodes";
import type { WorkflowNode } from "./schema";

export interface DecisionPreviewItem {
  messageId: string;
  from: string;
  subject: string;
  answers: Record<string, DecisionAnswer> | null;
}

export type DecisionPreview =
  | { ok: true; items: DecisionPreviewItem[] }
  | { ok: false; message: string };

export async function previewDecision(args: {
  userId: string;
  mail: Pick<MailScope, "userId" | "workspaceId" | "adapter" | "mailboxes" | "isAggregate"> | null;
  node: Extract<WorkflowNode, { kind: "decision.ask" }>;
  limit: number;
}): Promise<DecisionPreview> {
  await enforceRateLimit(args.userId, {
    scope: "workflow-decision-preview",
    limit: 10,
    windowSec: 60,
  });
  if (!decisionEnabled("workflowNode")) {
    return {
      ok: false,
      message: "Ask and Branch steps are turned off on this instance",
    };
  }
  if (args.node.questions.length === 0) {
    return { ok: false, message: "Add a question to this Ask step first" };
  }

  const { mail } = args;
  const mailbox = mail?.mailboxes[0];
  if (!mail || mail.isAggregate || !mailbox) {
    return { ok: false, message: "That mailbox is not in this workspace" };
  }
  if (!policyForMailbox(mail, mailbox.mailboxId).ai) {
    return { ok: false, message: "AI is turned off for this mailbox" };
  }

  const listed = await mail.adapter.listMessages("inbox", undefined, args.limit);
  const emails = (listed.emails ?? []).slice(0, args.limit);
  const full = needsFullFacts(args.node.state.fields);
  const questions = Object.fromEntries(
    args.node.questions.map((question) => [question.id, wireQuestion(question)]),
  );

  const load = async (email: Email): Promise<Email> => {
    if (!full) return email;
    const [message, attachments] = await Promise.all([
      mail.adapter.getMessage(email.id),
      mail.adapter.listAttachments(email.id),
    ]);
    return { ...email, ...message, id: email.id, attachments };
  };

  const items = await Promise.all(
    emails.map(async (email): Promise<DecisionPreviewItem> => {
      const loaded = await load(email);
      const outcome = await decideOne({
        state: buildDecisionState(factsFromEmail(loaded, full), args.node.state.fields),
        questions,
      });
      if (!outcome.refused) {
        recordAiUsage({
          userId: mail.userId,
          workspaceId: mail.workspaceId,
          feature: "workflow-decision",
          provider: decisionUsageProvider(),
          model: outcome.modelId,
          usage: outcome.usage,
        });
      }
      const answers = outcome.refused
        ? null
        : Object.fromEntries(
            args.node.questions.map((question) => [
              question.id,
              toDecisionAnswer((outcome.answers as Record<string, unknown>)[question.id]),
            ]),
          );
      return {
        messageId: email.id,
        from: email.fromName || email.from,
        subject: email.subject,
        answers,
      };
    }),
  );

  return { ok: true, items };
}
