import "server-only";
import { messageAction, type NodeHandler } from "../nodes";

export const actionStar: NodeHandler<"action.star"> = (node, envelope, ctx) =>
  messageAction(node, envelope, ctx, async (box, message) => {
    await box.adapter.starMessage(message.messageId, true);
    return undefined;
  });
