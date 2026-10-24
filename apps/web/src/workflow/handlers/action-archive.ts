import "server-only";
import { moveAction, type NodeHandler } from "../nodes";
import { retargetSnooze } from "../store";

export const actionArchive: NodeHandler<"action.archive"> = (node, envelope, ctx) =>
  moveAction(node, envelope, ctx, async (box, messageId) => {
    const moved = await box.adapter.archiveMessage(messageId);
    if (ctx.definition.kind === "snooze" && moved !== messageId) {
      await retargetSnooze({
        workflowId: ctx.definition.id,
        messageId: moved,
      });
    }
    return moved;
  });
