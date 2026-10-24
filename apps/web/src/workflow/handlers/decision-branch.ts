import "server-only";
import { routeAnswer } from "../decision";
import type { NodeHandler } from "../nodes";

export const decisionBranch: NodeHandler<"decision.branch"> = (node, envelope) => {
  if (envelope.port !== "message" || !envelope.decision) {
    return { outputs: [], detail: "no answer to branch on" };
  }
  const { decision: asked, ...message } = envelope;
  const routed = routeAnswer(asked.question, asked.answer, node);
  return {
    outputs: [
      {
        handle: routed.handle,
        envelopes: [{ ...message, lineage: [...envelope.lineage, node.id] }],
      },
    ],
    receipt: {
      operation: "decide",
      decision: {
        handle: routed.handle,
        probability: routed.probability,
        model: asked.model,
        ...(routed.score !== undefined ? { score: routed.score } : {}),
      },
    },
    detail: routed.handle,
  };
};
