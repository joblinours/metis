"use client";

import {
  ResolveDispatchDialog,
  type ResolveView,
  SEND_COPY,
} from "@/components/workflow-history/resolve-dispatch-dialog";
import { useMailboxScope } from "@/hooks/use-workspace-path";
import { orpc } from "@/lib/orpc";
import type { ScheduledSendItem } from "@/server/schema";

export const CLOSE_REASON_LABELS = SEND_COPY.reasons;

export function ResolveSendDialog({
  item,
  onDone,
}: {
  item: ScheduledSendItem;
  onDone: () => void;
}) {
  const scope = useMailboxScope();

  async function load(): Promise<ResolveView> {
    const view = await orpc.mail.scheduledSend.unconfirmed({ ...scope, id: item.id });
    if (view.state === "none") return view;
    return {
      state: "unconfirmed",
      stepRunId: view.stepRunId,
      settled: view.settled,
      reconcilable: true,
      error: view.error,
      lookupError: view.lookupError,
      notice: view.notice,
      candidates: view.candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.subject,
        subtitle: `To: ${candidate.to.join(", ")}`,
        at: candidate.date,
      })),
    };
  }

  return (
    <ResolveDispatchDialog
      copy={SEND_COPY}
      load={load}
      submit={(stepRunId, decision) =>
        orpc.mail.scheduledSend.resolve({
          ...scope,
          id: item.id,
          stepRunId,
          decision:
            decision.outcome === "verified"
              ? { outcome: "verified", providerMessageId: decision.candidateId }
              : decision,
        })
      }
      onDone={onDone}
    />
  );
}
