"use client";

import { toast } from "sonner";

import { orpc } from "@/lib/orpc";
import type { MailboxScope } from "@/server/schema";

import { setCachedLabels } from "./mail-cache";

export interface LabelUndoEntry {
  id: string;
  previousLabel: string | null;
}

async function revert(
  toastId: string,
  entries: LabelUndoEntry[],
  scope: MailboxScope,
): Promise<void> {
  toast.loading("Reverting…", { id: toastId });

  setCachedLabels(scope, (current) => {
    const labels = { ...current };
    for (const entry of entries) {
      if (entry.previousLabel === null) delete labels[entry.id];
      else labels[entry.id] = { label: entry.previousLabel, confidence: 100 };
    }
    return labels;
  });

  try {
    await orpc.mail.labels.restoreLabels({
      ...scope,
      entries: entries.map((e) => ({ id: e.id, label: e.previousLabel })),
    });
    toast.success("Label change undone", { id: toastId, duration: 2500 });
  } catch {
    toast.error("Couldn't undo the label change", {
      id: toastId,
      duration: 4000,
    });
  }
}

export function showLabelUndo(
  appliedLabelName: string,
  entries: LabelUndoEntry[],
  scope: MailboxScope,
): void {
  const count = entries.length;
  const noun = count === 1 ? "email" : "emails";
  const id = crypto.randomUUID();

  toast(`Labeled ${count} ${noun} as ${appliedLabelName}`, {
    id,
    duration: 6000,
    action: {
      label: "Undo",
      onClick: () => void revert(id, entries, scope),
    },
  });
}
