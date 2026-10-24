import "server-only";
import { htmlToText } from "@/lib/utils";

import {
  factsFromEmail,
  itemKey,
  messageEnvelope,
  type NodeHandler,
  requireMailbox,
} from "../nodes";
import type { DraftFacts } from "../runtime";

export const mailboxSource: NodeHandler<"mailbox.source"> = async (node, envelope, ctx) => {
  const lineage = [...envelope.lineage, node.id];

  if (node.operation === "draft") {
    const payload = await ctx.payload();
    if (!payload) {
      return { outputs: [], detail: "no payload left to send" };
    }
    const draft: DraftFacts = {
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      bodyText: payload.bodyText ?? htmlToText(payload.bodyHtml ?? ""),
      hasAttachment: (payload.attachments?.length ?? 0) > 0,
    };
    return {
      outputs: [
        {
          handle: "out",
          envelopes: [
            {
              port: "draft",
              key: itemKey(node.id, node.mailboxId, "draft"),
              mailboxId: node.mailboxId,
              draft,
              lineage,
            },
          ],
        },
      ],
    };
  }

  if (node.operation === "message") {
    const target = node.messageId;
    if (!target) return { outputs: [], detail: "no message selected" };
    const box = await requireMailbox(ctx, node.mailboxId);
    const loaded = await box.adapter.getMessage(target);
    const facts = factsFromEmail(
      {
        ...loaded,
        id: loaded.id ?? target,
        threadId: loaded.threadId ?? node.threadId,
      },
      true,
    );
    return {
      outputs: [
        {
          handle: "out",
          envelopes: [messageEnvelope(node.id, node.mailboxId, facts, lineage)],
        },
      ],
      detail: box.email,
    };
  }

  if (node.operation === "incoming") {
    const input = ctx.input;
    const messages =
      input.kind === "newMail" ? input.messages.filter((m) => m.mailboxId === node.mailboxId) : [];
    const box = await ctx.mailbox(node.mailboxId).catch(() => null);
    const count = `${messages.length} message(s)`;
    return {
      outputs: [
        {
          handle: "out",
          envelopes: messages.map((m) =>
            messageEnvelope(
              node.id,
              node.mailboxId,
              factsFromEmail(
                {
                  id: m.messageId,
                  threadId: m.threadId,
                  from: m.from,
                  fromName: m.fromName,
                  to: m.to,
                  cc: m.cc,
                  subject: m.subject,
                  snippet: m.snippet,
                  date: m.date,
                },
                false,
              ),
              lineage,
            ),
          ),
        },
      ],
      detail: box?.ok ? `${count} in ${box.value.email}` : count,
    };
  }

  const box = await requireMailbox(ctx, node.mailboxId);
  const listed = node.query
    ? await box.adapter.search(node.query)
    : await box.adapter.listMessages(node.folder, undefined, node.limit);
  const picked =
    ctx.input.kind === "manual" && ctx.input.messages?.length
      ? new Set(
          ctx.input.messages.filter((m) => m.mailboxId === node.mailboxId).map((m) => m.messageId),
        )
      : null;
  const selected = picked
    ? (listed.emails ?? []).filter((e) => picked.has(e.id))
    : (listed.emails ?? []).slice(0, node.limit);

  return {
    outputs: [
      {
        handle: "out",
        envelopes: selected.map((email) =>
          messageEnvelope(node.id, node.mailboxId, factsFromEmail(email, false), lineage),
        ),
      },
    ],
    detail: `${selected.length} message(s) in ${box.email}`,
  };
};
