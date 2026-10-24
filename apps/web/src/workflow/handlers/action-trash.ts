import "server-only";
import { messageAction, type NodeHandler } from "../nodes";

export const actionTrash: NodeHandler<"action.trash"> = (node, envelope, ctx) =>
  messageAction(node, envelope, ctx, async (box, message) => {
    await box.adapter.deleteMessage(message.messageId);
    return undefined;
  });
