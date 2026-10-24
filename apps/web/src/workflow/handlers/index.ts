import "server-only";
import type { HandlerResult, NodeContext, NodeHandler } from "../nodes";
import type { Envelope } from "../runtime";
import type { TriggerKind, WorkflowNode, WorkflowNodeKind } from "../schema";
import { actionArchive } from "./action-archive";
import { actionAutoBcc } from "./action-auto-bcc";
import { actionLabel } from "./action-label";
import { actionMarkRead } from "./action-mark-read";
import { actionMute } from "./action-mute";
import { actionRestore } from "./action-restore";
import { actionSend } from "./action-send";
import { actionStar } from "./action-star";
import { actionSystem } from "./action-system";
import { actionTrash } from "./action-trash";
import { condition } from "./condition";
import { decisionAsk } from "./decision-ask";
import { decisionBranch } from "./decision-branch";
import { mailboxSource } from "./mailbox-source";
import { mergeAppend } from "./merge-append";
import { mergeJoin } from "./merge-join";

type StepKind = Exclude<WorkflowNodeKind, TriggerKind>;

const HANDLERS: { [K in StepKind]: NodeHandler<K> } = {
  "mailbox.source": mailboxSource,
  condition,
  "decision.ask": decisionAsk,
  "decision.branch": decisionBranch,
  "merge.append": mergeAppend,
  "merge.join": mergeJoin,
  "action.markRead": actionMarkRead,
  "action.star": actionStar,
  "action.label": actionLabel,
  "action.mute": actionMute,
  "action.archive": actionArchive,
  "action.trash": actionTrash,
  "action.restore": actionRestore,
  "action.send": actionSend,
  "action.autoBcc": actionAutoBcc,
  "action.system": actionSystem,
};

export async function runNode(
  node: WorkflowNode,
  envelope: Envelope,
  ctx: NodeContext,
): Promise<HandlerResult> {
  const handler =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HANDLERS maps each step kind to its own handler; TypeScript cannot correlate node.kind with that entry (microsoft/TypeScript#30581)
    (HANDLERS as Partial<Record<WorkflowNodeKind, unknown>>)[node.kind] as
      | NodeHandler<WorkflowNodeKind>
      | undefined;
  if (!handler) return { outputs: [], detail: "nothing to run" };
  return handler(node, envelope, ctx);
}
