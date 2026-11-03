import "server-only";
import { z } from "zod";

import { BadRequestError } from "@/lib/errors/bad-request";
import { decodeMimeHeader, parseRecipientList } from "@/mail/recipients";
import type { DraftPayload } from "@/types/mail";

import type { AgentMailbox } from "./scope";

const REPLY_HEADERS = ["from", "reply-to", "to", "cc", "subject", "message-id", "references"];

export const replyToInput = z.object({
  id: z.string().min(1).describe("The id of the email being answered, in this mailbox"),
  all: z
    .boolean()
    .optional()
    .describe("Reply all: also address everyone on the original To and Cc, except yourself"),
});

export type ReplyToInput = z.infer<typeof replyToInput>;

type ReplyFields = Pick<
  DraftPayload,
  "to" | "cc" | "subject" | "inReplyTo" | "references" | "replyToMessageId"
>;

function uniqueAddresses(addresses: string[], exclude: Set<string>): string[] {
  const seen = new Set(exclude);
  const out: string[] = [];
  for (const address of addresses) {
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

function emails(raw: string | undefined): string[] {
  return parseRecipientList(raw).map((r) => r.email);
}

export async function replyFields(
  mailbox: AgentMailbox,
  replyTo: ReplyToInput,
): Promise<ReplyFields> {
  const headers = await mailbox.adapter.getHeaders(replyTo.id, REPLY_HEADERS).catch(() => null);
  if (!headers || Object.keys(headers).length === 0) {
    throw new BadRequestError(`No email "${replyTo.id}" in this mailbox to reply to`);
  }
  const self = new Set([mailbox.email.toLowerCase()]);
  const sender = emails(headers["reply-to"]).length
    ? emails(headers["reply-to"])
    : emails(headers.from);
  const fromSelf = emails(headers.from).some((e) => self.has(e.toLowerCase()));
  const to = uniqueAddresses(
    fromSelf ? emails(headers.to) : sender,
    replyTo.all || fromSelf ? self : new Set(),
  );
  const cc = replyTo.all
    ? uniqueAddresses(
        [...(fromSelf ? [] : emails(headers.to)), ...emails(headers.cc)],
        new Set([...self, ...to.map((a) => a.toLowerCase())]),
      )
    : [];
  const subject = decodeMimeHeader(headers.subject).trim();
  const messageId = headers["message-id"];
  const references = [headers.references, messageId].filter(Boolean).join(" ");
  return {
    to,
    cc,
    subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
    ...(messageId ? { inReplyTo: messageId } : {}),
    ...(references ? { references } : {}),
    replyToMessageId: replyTo.id,
  };
}
