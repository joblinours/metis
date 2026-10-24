import "server-only";
import { db } from "@/db";
import { mailMute } from "@/db/schema";

import { messageAction, type NodeHandler, requirePrincipal } from "../nodes";

export const actionMute: NodeHandler<"action.mute"> = (node, envelope, ctx) =>
  messageAction(node, envelope, ctx, async (box, message) => {
    const userId = requirePrincipal(ctx);
    const threadId = message.message.threadId;
    if (!threadId) return `${box.email} · no thread`;
    await db
      .insert(mailMute)
      .values({
        id: crypto.randomUUID(),
        userId,
        mailboxId: message.mailboxId,
        threadId,
        createdAt: ctx.now,
      })
      .onConflictDoNothing({
        target: [mailMute.userId, mailMute.mailboxId, mailMute.threadId],
      });
    return undefined;
  });
