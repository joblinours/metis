"use client";

import { FieldDescription } from "@metis/ui/components/field";

import { useEditorEnv } from "../editor-context";
import { useEditor } from "../editor-store";
import type { StepFormProps } from "./types";

export function NewMailForm({ node }: StepFormProps<"trigger.newMail">) {
  const { mailboxes, sources } = useEditorEnv();
  const graph = useEditor((s) => s.graph);
  const targets = new Set(graph.edges.filter((e) => e.source === node.id).map((e) => e.target));
  const source = graph.nodes.find((n) => targets.has(n.id) && n.kind === "mailbox.source");
  const mailboxId = source?.kind === "mailbox.source" ? source.mailboxId : null;
  const email = mailboxes.find((m) => m.mailboxId === mailboxId)?.email;
  const saved = sources.get(node.id);
  const state = saved && saved.mailboxId === mailboxId ? saved : undefined;

  if (!mailboxId) {
    return (
      <FieldDescription>
        Connect this trigger to one Mailbox step set to newly arrived mail. Add another trigger to
        watch another mailbox.
      </FieldDescription>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border-soft bg-panel px-3 py-2 text-[13px]">
      <p className="truncate">
        Watching{" "}
        <span className="font-mono text-[12px]">{email ?? "a mailbox you cannot see"}</span>
      </p>
      <p className="text-[12px] text-muted-foreground">
        {!state
          ? "Starts watching once you save."
          : state.paused
            ? "Paused: mail is not being watched."
            : state.error
              ? `Last check failed: ${state.error}`
              : !state.baselined
                ? "Taking a baseline: mail already there is skipped."
                : state.lastScanAt
                  ? `Checked ${new Date(state.lastScanAt).toLocaleString()}`
                  : "Waiting for the first check."}
      </p>
    </div>
  );
}
