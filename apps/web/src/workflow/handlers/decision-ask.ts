import "server-only";
import { recordAiUsage } from "@/ai/usage";
import {
  DecisionConfigError,
  decideOne,
  decisionEnabled,
  decisionUsageProvider,
  getDecision,
} from "@/services/decision";

import {
  buildDecisionState,
  needsFullFacts,
  questionHandle,
  toDecisionAnswer,
  wireQuestion,
} from "../decision";
import { BlockedError, ensureLoaded, type NodeHandler } from "../nodes";

export const decisionAsk: NodeHandler<"decision.ask"> = async (node, envelope, ctx) => {
  if (envelope.port !== "message") {
    return { outputs: [], detail: "no message to ask about" };
  }
  if (!decisionEnabled("workflowNode")) {
    throw new BlockedError("Ask and Branch steps are turned off on this instance");
  }
  const ai = await ctx.aiAllowed(envelope.mailboxId);
  if (!ai.ok) throw new BlockedError(ai.reason);

  const loaded = needsFullFacts(node.state.fields) ? await ensureLoaded(envelope, ctx) : envelope;

  let outcome: Awaited<ReturnType<typeof decideOne>>;
  try {
    outcome = await decideOne({
      state: buildDecisionState(loaded.message, node.state.fields),
      questions: Object.fromEntries(
        node.questions.map((question) => [question.id, wireQuestion(question)]),
      ),
      signal: ctx.signal,
    });
  } catch (err) {
    if (err instanceof DecisionConfigError) throw new BlockedError(err.message);
    throw err;
  }

  const model = outcome.refused ? getDecision().model.modelId : outcome.modelId;
  if (!outcome.refused && ctx.principal.userId) {
    recordAiUsage({
      userId: ctx.principal.userId,
      workspaceId: ctx.principal.workspaceId,
      feature: "workflow-decision",
      provider: decisionUsageProvider(),
      model,
      usage: outcome.usage,
      runId: ctx.runId ?? undefined,
    });
  }

  const answers = outcome.refused ? null : (outcome.answers as Record<string, unknown>);
  const lineage = [...envelope.lineage, node.id];
  return {
    outputs: node.questions.map((question) => ({
      handle: questionHandle(question.id),
      envelopes: [
        {
          ...loaded,
          lineage,
          decision: {
            askNodeId: node.id,
            question,
            answer: answers ? toDecisionAnswer(answers[question.id]) : { type: "refusal" },
            model,
          },
        },
      ],
    })),
    detail: outcome.refused ? "refused" : "answered",
  };
};
