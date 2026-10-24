import "server-only";
import { moveAction, type NodeHandler } from "../nodes";

export const actionRestore: NodeHandler<"action.restore"> = (node, envelope, ctx) =>
  moveAction(node, envelope, ctx, (box, messageId) => box.adapter.restoreMessage(messageId));
