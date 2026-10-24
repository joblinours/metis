import "server-only";
import type { NodeHandler } from "../nodes";
import type { DraftFacts } from "../runtime";

export const actionAutoBcc: NodeHandler<"action.autoBcc"> = (node, envelope) => {
  if (envelope.port !== "draft") {
    return { outputs: [], detail: "no draft to amend" };
  }
  const address = node.address.trim();
  const taken = new Set(
    [...envelope.draft.to, ...(envelope.draft.cc ?? []), ...(envelope.draft.bcc ?? [])]
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  );

  const draft: DraftFacts = taken.has(address.toLowerCase())
    ? envelope.draft
    : { ...envelope.draft, bcc: [...(envelope.draft.bcc ?? []), address] };

  return {
    outputs: [
      {
        handle: "out",
        envelopes: [{ ...envelope, draft, lineage: [...envelope.lineage, node.id] }],
      },
    ],
    detail: taken.has(address.toLowerCase()) ? "already present" : address,
  };
};
