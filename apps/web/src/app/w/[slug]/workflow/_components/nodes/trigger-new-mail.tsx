"use client";

import { FieldDescription } from "@metis/ui/components/field";
import { type NodeProps, useStore } from "@xyflow/react";

import { type WfKindNode, wfData } from "@/workflow/graph";

import { NodeFrame } from "./node-frame";

export function TriggerNewMailNode({ id, data }: NodeProps<WfKindNode<"trigger.newMail">>) {
  const { node, mailboxes, source: state } = data;
  const mailboxId = useStore((s) => {
    for (const edge of s.edges) {
      if (edge.source !== id) continue;
      const target = wfData(s.nodeLookup.get(edge.target)?.data);
      if (target?.node.kind === "mailbox.source") return target.node.mailboxId;
    }
    return null;
  });
  const email = mailboxes.find((m) => m.mailboxId === mailboxId)?.email;
  const saved = state?.mailboxId === mailboxId ? state : undefined;

  return (
    <NodeFrame id={id} node={node}>
      {!mailboxId ? (
        <FieldDescription className="text-xs">
          Connect this to one mailbox step set to “newly arrived mail”. Add another trigger to watch
          another mailbox.
        </FieldDescription>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="truncate text-xs">Watching {email ?? "a mailbox you cannot see"}</p>
          {saved?.paused ? (
            <FieldDescription className="text-[11px]">
              Paused — mail is not being watched
            </FieldDescription>
          ) : saved?.error ? (
            <p className="text-[11px] text-destructive-text">Last check failed: {saved.error}</p>
          ) : saved && !saved.baselined ? (
            <FieldDescription className="text-[11px]">
              Taking a baseline — mail already there is skipped
            </FieldDescription>
          ) : saved?.lastScanAt ? (
            <FieldDescription className="text-[11px]">
              Checked {new Date(saved.lastScanAt).toLocaleString()}
            </FieldDescription>
          ) : null}
        </div>
      )}
    </NodeFrame>
  );
}
