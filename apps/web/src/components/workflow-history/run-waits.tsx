"use client";

import { Badge } from "@metis/ui/components/badge";
import { format } from "date-fns";
import { Clock } from "lucide-react";

import type { WorkflowRunDetail } from "@/server/schema";
import { nodeTitle } from "@/workflow/steps";

import { ApprovalActions } from "./approval-actions";

type Wait = WorkflowRunDetail["waits"][number];

const KIND_LABELS: Record<string, string> = {
  time: "Waiting until",
  event: "Waiting for an event",
  approval: "Waiting for approval",
  call: "Waiting for a called workflow",
};

const STATUS_LABELS: Record<string, string> = {
  open: "open",
  resolved: "resolved",
  expired: "timed out",
  cancelled: "cancelled",
};

function when(iso: string | null): string | null {
  return iso ? format(new Date(iso), "PPp") : null;
}

function WaitRow({ wait, graph }: { wait: Wait; graph: WorkflowRunDetail["graph"] }) {
  const node = graph.nodes.find((n) => n.id === wait.nodeId);
  const wake = when(wait.wakeAt);
  const deadline = when(wait.deadlineAt);
  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Clock className="size-3.5 shrink-0 text-brand-text" />
        <span className="font-medium">{node ? nodeTitle(node) : wait.nodeId}</span>
        <span className="text-muted-foreground">{KIND_LABELS[wait.kind] ?? wait.kind}</span>
        <Badge variant={wait.status === "open" ? "secondary" : "outline"} className="ml-auto">
          {STATUS_LABELS[wait.status] ?? wait.status}
        </Badge>
      </div>
      {(wake || deadline) && (
        <p className="text-[12px] text-faint">
          {wake && `wakes ${wake}`}
          {wake && deadline && " · "}
          {deadline && `times out ${deadline}`}
        </p>
      )}
      {wait.request && (
        <p className="whitespace-pre-wrap text-[13px] text-foreground">{wait.request}</p>
      )}
      {wait.approvers.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Asked {wait.approvers.map((a) => a.name || a.email).join(", ")}
        </p>
      )}
      {wait.decision && (
        <p className="text-[12px] text-muted-foreground">
          {wait.decision === "approved"
            ? "Approved"
            : wait.decision === "denied"
              ? "Denied"
              : wait.decision}
          {wait.decidedBy && ` by ${wait.decidedBy.name || wait.decidedBy.email}`}
        </p>
      )}
      {wait.kind === "approval" && wait.status === "open" && wait.canDecide && (
        <ApprovalActions waitId={wait.id} />
      )}
    </li>
  );
}

export function RunWaits({
  run,
  openOnly = false,
}: {
  run: WorkflowRunDetail;
  openOnly?: boolean;
}) {
  const waits = openOnly ? run.waits.filter((w) => w.status === "open") : run.waits;
  if (waits.length === 0) return null;
  return (
    <ul aria-label="Waits" className="flex flex-col divide-y divide-border-soft">
      {waits.map((wait) => (
        <WaitRow key={wait.id} wait={wait} graph={run.graph} />
      ))}
    </ul>
  );
}
