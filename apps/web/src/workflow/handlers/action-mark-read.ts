import "server-only";
import { messageAction, type NodeHandler } from "../nodes";

export const actionMarkRead: NodeHandler<"action.markRead"> = (node, envelope, ctx) =>
  messageAction(node, envelope, ctx, async (box, message) => {
    await box.adapter.markRead(message.messageId, true);
    return undefined;
  });
