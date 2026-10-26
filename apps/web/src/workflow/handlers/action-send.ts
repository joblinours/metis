import "server-only";
import type { DraftPayload } from "@/types/mail";

import { sendFingerprint } from "../fingerprint";
import { factsFromEmail, messageEnvelope, type NodeHandler, requireMailbox } from "../nodes";

export const actionSend: NodeHandler<"action.send"> = async (node, envelope, ctx) => {
  if (envelope.port !== "draft") {
    return { outputs: [], detail: "no draft to send" };
  }
  if (ctx.mode === "policy") return { outputs: [], detail: "skipped in send policy" };
  if (ctx.mode === "test") return { outputs: [], detail: "not run in a test run" };

  const payload = await ctx.payload();
  if (!payload) return { outputs: [], detail: "payload already consumed" };

  const box = await requireMailbox(ctx, envelope.mailboxId);
  const outgoing: DraftPayload = { ...payload, bcc: envelope.draft.bcc };
  const sent = await box.adapter.sendMessage(outgoing);

  const facts = factsFromEmail(
    {
      id: sent.id ?? "",
      from: box.email,
      to: outgoing.to,
      cc: outgoing.cc,
      subject: outgoing.subject,
      snippet: "",
    },
    true,
  );

  return {
    outputs: sent.id
      ? [
          {
            handle: "out",
            envelopes: [
              messageEnvelope(node.id, envelope.mailboxId, facts, [...envelope.lineage, node.id]),
            ],
          },
        ]
      : [],
    receipt: {
      operation: "send",
      providerMessageId: sent.id,
      dispatchedAt: ctx.now.toISOString(),
      settledAt: new Date().toISOString(),
      fingerprint: sendFingerprint(outgoing),
    },
    detail: sent.id ? `sent as ${sent.id}` : "sent",
  };
};
