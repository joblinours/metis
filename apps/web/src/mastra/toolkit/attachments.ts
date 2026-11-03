import "server-only";
import { BadRequestError } from "@/lib/errors/bad-request";
import { type DraftAttachmentInput, resolveDraftAttachments } from "@/ops/attachments";
import { replyFields, type ReplyToInput } from "@/ops/reply";
import type { DraftAttachment, DraftPayload } from "@/types/mail";

import { type AgentMailbox, mailboxById, type WorkspaceCtx } from "../runtime-context";
import { ToolRefusal } from "./resolve";

export async function draftAttachments(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  inputs: DraftAttachmentInput[] | undefined,
): Promise<DraftAttachment[] | undefined> {
  if (inputs === undefined) return undefined;
  try {
    return await resolveDraftAttachments(mailbox, inputs, (id) => mailboxById(ctx, id) ?? null);
  } catch (err) {
    if (err instanceof BadRequestError) throw new ToolRefusal(err.message);
    throw err;
  }
}

export async function draftPayload(
  ctx: WorkspaceCtx,
  mailbox: AgentMailbox,
  input: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyHtml: string;
    attachments?: DraftAttachmentInput[];
    replyTo?: ReplyToInput;
  },
): Promise<DraftPayload> {
  let reply: Awaited<ReturnType<typeof replyFields>> | null = null;
  if (input.replyTo) {
    try {
      reply = await replyFields(mailbox, input.replyTo);
    } catch (err) {
      if (err instanceof BadRequestError) throw new ToolRefusal(err.message);
      throw err;
    }
  }
  const to = input.to?.length ? input.to : (reply?.to ?? []);
  if (to.length === 0) {
    throw new ToolRefusal("Give the recipients in to, or replyTo to answer an email");
  }
  const subject = input.subject ?? reply?.subject;
  if (subject === undefined) throw new ToolRefusal("Give a subject");
  const cc = input.cc ?? (reply?.cc?.length ? reply.cc : undefined);
  return {
    to,
    ...(cc ? { cc } : {}),
    ...(input.bcc ? { bcc: input.bcc } : {}),
    subject,
    bodyHtml: input.bodyHtml,
    ...(reply?.inReplyTo ? { inReplyTo: reply.inReplyTo } : {}),
    ...(reply?.references ? { references: reply.references } : {}),
    ...(reply ? { replyToMessageId: reply.replyToMessageId } : {}),
    attachments: await draftAttachments(ctx, mailbox, input.attachments),
  };
}
