import "server-only";
import { setUserLabel } from "@/mail/labels";

import { messageAction, type NodeHandler, requirePrincipal } from "../nodes";

export const actionLabel: NodeHandler<"action.label"> = (node, envelope, ctx) =>
  messageAction(node, envelope, ctx, async (_box, message) => {
    await setUserLabel({
      userId: requirePrincipal(ctx),
      mailboxId: message.mailboxId,
      messageId: message.messageId,
      label: node.label,
    });
    return undefined;
  });
