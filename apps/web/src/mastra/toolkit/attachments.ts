import "server-only";
import { BadRequestError } from "@/lib/errors/bad-request";
import { type DraftAttachmentInput, resolveDraftAttachments } from "@/ops/attachments";
import type { DraftAttachment } from "@/types/mail";

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
