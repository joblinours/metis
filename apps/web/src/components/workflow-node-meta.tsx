import {
  Bell,
  CalendarClock,
  Inbox,
  Merge,
  MessageCircleQuestion,
  Play,
  Send,
  Split,
  Trash2,
  Wrench,
} from "lucide-react";

import type { WorkflowNodeKind } from "@/workflow/schema";
import { isMergeKind } from "@/workflow/schema";

export function iconFor(kind: WorkflowNodeKind) {
  if (kind === "trigger.newMail") return <Inbox className="size-4 text-primary" />;
  if (kind === "trigger.schedule") {
    return <CalendarClock className="size-4 text-primary" />;
  }
  if (kind === "trigger.manual") return <Play className="size-4 text-primary" />;
  if (kind === "trigger.beforeSend") {
    return <Send className="size-4 text-primary" />;
  }
  if (kind === "trigger.once") {
    return <CalendarClock className="size-4 text-primary" />;
  }
  if (kind === "mailbox.source") {
    return <Inbox className="size-4 text-muted-foreground" />;
  }
  if (kind === "condition") return <Bell className="size-4 text-faint" />;
  if (kind === "decision.ask") {
    return <MessageCircleQuestion className="size-4 text-faint" />;
  }
  if (kind === "decision.branch") return <Split className="size-4 text-faint" />;
  if (isMergeKind(kind)) return <Merge className="size-4 text-faint" />;
  if (kind === "action.system") return <Wrench className="size-4 text-faint" />;
  return <Trash2 className="size-4 text-emerald-500" />;
}

export function toneFor(kind: WorkflowNodeKind): string {
  if (kind.startsWith("trigger.")) return "bg-brand-soft/40";
  if (kind === "condition") return "";
  if (kind.startsWith("action.")) return "bg-emerald-500/5";
  return "";
}

export function borderFor(kind: WorkflowNodeKind): string {
  if (kind.startsWith("trigger.")) return "border-primary/40";
  if (kind.startsWith("action.")) return "border-emerald-500/30";
  return "border-border";
}
