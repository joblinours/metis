import type { WorkflowEdge, WorkflowNode, WorkflowNodeKind } from "../schema";
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
import { triggerBeforeSend } from "./trigger-before-send";
import { triggerManual } from "./trigger-manual";
import { triggerNewMail } from "./trigger-new-mail";
import { triggerOnce } from "./trigger-once";
import { triggerSchedule } from "./trigger-schedule";
import type { GraphShape, KindOutput, NodeKindDefinition } from "./types";

export const NODE_KINDS: {
  [K in WorkflowNodeKind]: NodeKindDefinition<K>;
} = {
  "trigger.newMail": triggerNewMail,
  "trigger.schedule": triggerSchedule,
  "trigger.manual": triggerManual,
  "trigger.once": triggerOnce,
  "trigger.beforeSend": triggerBeforeSend,
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

export function kindOf(kind: WorkflowNodeKind): NodeKindDefinition<WorkflowNodeKind> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- NODE_KINDS maps each kind to its own definition; TypeScript cannot widen the correlated entry (microsoft/TypeScript#30581)
  return NODE_KINDS[kind] as unknown as NodeKindDefinition<WorkflowNodeKind>;
}

export function kindLabel(kind: WorkflowNodeKind): string {
  return NODE_KINDS[kind].label;
}

export function nodeOutputs(node: WorkflowNode, graph: GraphShape): KindOutput[] {
  return kindOf(node.kind).outputs(node, graph);
}

export function nodeMailboxId(node: WorkflowNode): string | null {
  return kindOf(node.kind).mailboxId?.(node) ?? null;
}

export function outputLabel(
  graph: GraphShape,
  edge: Pick<WorkflowEdge, "source" | "sourceHandle">,
): string | undefined {
  const source = graph.nodes.find((n) => n.id === edge.source);
  if (!source) return undefined;
  return nodeOutputs(source, graph).find((o) => o.id === edge.sourceHandle)?.label;
}

export function edgeLabel(
  graph: GraphShape,
  edge: Pick<WorkflowEdge, "source" | "sourceHandle" | "target">,
): string {
  const title = (id: string) => {
    const node = graph.nodes.find((n) => n.id === id);
    return node ? kindLabel(node.kind) : "a step";
  };
  const output = outputLabel(graph, edge);
  return `${title(edge.source)}${output ? ` (${output})` : ""} to ${title(edge.target)}`;
}

export type {
  GraphShape,
  KindCheckContext,
  KindInput,
  KindOutput,
  NodeKindDefinition,
  NodeOf,
  PortType,
} from "./types";
