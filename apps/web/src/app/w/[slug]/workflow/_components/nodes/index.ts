import type { NodeTypes } from "@xyflow/react";

import type { WorkflowNodeKind } from "@/workflow/schema";

import { ActionArchiveNode } from "./action-archive";
import { ActionAutoBccNode } from "./action-auto-bcc";
import { ActionLabelNode } from "./action-label";
import { ActionMarkReadNode } from "./action-mark-read";
import { ActionMuteNode } from "./action-mute";
import { ActionRestoreNode } from "./action-restore";
import { ActionSendNode } from "./action-send";
import { ActionStarNode } from "./action-star";
import { ActionSystemNode } from "./action-system";
import { ActionTrashNode } from "./action-trash";
import { ConditionNode } from "./condition";
import { DecisionAskNode } from "./decision-ask";
import { DecisionBranchNode } from "./decision-branch";
import { MailboxSourceNode } from "./mailbox-source";
import { MergeAppendNode } from "./merge-append";
import { MergeJoinNode } from "./merge-join";
import { TriggerBeforeSendNode } from "./trigger-before-send";
import { TriggerManualNode } from "./trigger-manual";
import { TriggerNewMailNode } from "./trigger-new-mail";
import { TriggerOnceNode } from "./trigger-once";
import { TriggerScheduleNode } from "./trigger-schedule";

export const nodeTypes = {
  "trigger.newMail": TriggerNewMailNode,
  "trigger.schedule": TriggerScheduleNode,
  "trigger.manual": TriggerManualNode,
  "trigger.once": TriggerOnceNode,
  "trigger.beforeSend": TriggerBeforeSendNode,
  "mailbox.source": MailboxSourceNode,
  condition: ConditionNode,
  "decision.ask": DecisionAskNode,
  "decision.branch": DecisionBranchNode,
  "merge.append": MergeAppendNode,
  "merge.join": MergeJoinNode,
  "action.markRead": ActionMarkReadNode,
  "action.star": ActionStarNode,
  "action.label": ActionLabelNode,
  "action.mute": ActionMuteNode,
  "action.archive": ActionArchiveNode,
  "action.trash": ActionTrashNode,
  "action.restore": ActionRestoreNode,
  "action.send": ActionSendNode,
  "action.autoBcc": ActionAutoBccNode,
  "action.system": ActionSystemNode,
} satisfies Record<WorkflowNodeKind, NodeTypes[string]>;
