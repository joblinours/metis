import {
  AlarmClock,
  Archive,
  ArchiveRestore,
  BellOff,
  CalendarClock,
  GitMerge,
  Inbox,
  type LucideIcon,
  MailOpen,
  MailPlus,
  Merge,
  MessageCircleQuestion,
  Play,
  Send,
  SendHorizontal,
  Signpost,
  Split,
  Star,
  Tag,
  Trash2,
  UserRoundPlus,
  Wrench,
} from "lucide-react";

import { type NodeCategory, type PortType } from "@/workflow/kinds";
import type { WorkflowNodeKind } from "@/workflow/schema";

export const NODE_ICONS: Record<WorkflowNodeKind, LucideIcon> = {
  "trigger.newMail": MailPlus,
  "trigger.schedule": CalendarClock,
  "trigger.manual": Play,
  "trigger.once": AlarmClock,
  "trigger.beforeSend": SendHorizontal,
  "mailbox.source": Inbox,
  condition: Split,
  "decision.ask": MessageCircleQuestion,
  "decision.branch": Signpost,
  "merge.append": Merge,
  "merge.join": GitMerge,
  "action.markRead": MailOpen,
  "action.star": Star,
  "action.label": Tag,
  "action.mute": BellOff,
  "action.archive": Archive,
  "action.trash": Trash2,
  "action.restore": ArchiveRestore,
  "action.send": Send,
  "action.autoBcc": UserRoundPlus,
  "action.system": Wrench,
};

export const CATEGORY_BADGE: Record<NodeCategory, string> = {
  trigger: "bg-primary text-primary-foreground",
  mail: "bg-(--label-custom-blue-mark) text-white",
  logic: "bg-(--label-custom-purple-mark) text-white",
  ai: "bg-(--label-custom-teal-mark) text-white",
  action: "bg-(--label-custom-green-mark) text-white",
  system: "bg-(--label-custom-gray-mark) text-white",
};

export const CATEGORY_COLOR: Record<NodeCategory, string> = {
  trigger: "var(--primary)",
  mail: "var(--label-custom-blue-mark)",
  logic: "var(--label-custom-purple-mark)",
  ai: "var(--label-custom-teal-mark)",
  action: "var(--label-custom-green-mark)",
  system: "var(--label-custom-gray-mark)",
};

export const PORT_HANDLE: Record<PortType | "any", string> = {
  signal: "!bg-primary",
  message: "!bg-(--label-custom-blue-mark)",
  draft: "!bg-(--label-custom-amber-mark)",
  any: "!bg-muted-foreground",
};

export function NodeIcon({ kind, className }: { kind: WorkflowNodeKind; className?: string }) {
  const Icon = NODE_ICONS[kind];
  return <Icon className={className} />;
}
