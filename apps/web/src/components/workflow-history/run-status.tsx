import { cn } from "@metis/ui/lib/utils";
import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  HelpCircle,
  Loader2,
  XCircle,
} from "lucide-react";

import type { WorkflowRunDetail } from "@/server/schema";
import type { NodeStatus } from "@/workflow/schema";

export type RunNode = WorkflowRunDetail["nodes"][number];

const STATUS_RANK: NodeStatus[] = [
  "unknown",
  "failed",
  "blocked",
  "dispatching",
  "running",
  "pending",
  "completed",
  "skipped",
];

const STATUS_LABELS: Record<string, string> = {
  unknown: "needs review",
  dispatching: "sending",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function worstStatus(statuses: Iterable<NodeStatus>): NodeStatus | null {
  const seen = new Set(statuses);
  return STATUS_RANK.find((status) => seen.has(status)) ?? null;
}

function nodeStatus(node: RunNode): NodeStatus | null {
  return worstStatus([
    ...node.lines.map((line) => line.status),
    ...node.items.map((item) => item.status),
  ]);
}

export interface StepState {
  status: NodeStatus | null;
  label: string;
  taken: boolean;
}

export function stepState(node: RunNode | undefined): StepState {
  if (!node?.reached) {
    return { status: null, label: "not reached", taken: false };
  }
  if (node.kind.startsWith("trigger.")) {
    return { status: "completed", label: "fired", taken: true };
  }
  const status = nodeStatus(node);
  return {
    status,
    label: statusLabel(status ?? "completed"),
    taken: status !== null && status !== "skipped",
  };
}

export function StatusIcon({ status, className }: { status: string | null; className?: string }) {
  const base = cn("size-4 shrink-0", className);
  if (status === "completed") {
    return <CheckCircle2 className={cn(base, "text-status-success")} />;
  }
  if (status === "pending" || status === "running" || status === "dispatching") {
    return <Loader2 className={cn(base, "animate-spin text-faint")} />;
  }
  if (status === "unknown") {
    return <HelpCircle className={cn(base, "text-brand-text")} />;
  }
  if (status === "blocked" || status === "cancelled") {
    return <CircleSlash className={cn(base, "text-brand-text")} />;
  }
  if (status === "skipped" || status === null) {
    return <CircleDashed className={cn(base, "text-faint")} />;
  }
  return <XCircle className={cn(base, "text-destructive-text")} />;
}
