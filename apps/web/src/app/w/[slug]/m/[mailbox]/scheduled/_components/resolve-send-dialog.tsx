"use client";

import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@metis/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metis/ui/components/select";
import { Textarea } from "@metis/ui/components/textarea";
import { CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useMailboxScope } from "@/hooks/use-workspace-path";
import { isOneOf } from "@/lib/guards";
import { orpc } from "@/lib/orpc";
import type {
  InspectUnconfirmedSendOutput,
  ScheduledSendItem,
  SendCloseReason,
} from "@/server/schema";
import { SEND_CLOSE_REASONS } from "@/workflow/schema";

export const CLOSE_REASON_LABELS: Record<SendCloseReason, string> = {
  "reported-delivered": "I believe it was delivered",
  "not-delivered": "It was not delivered",
  abandoned: "I no longer want it sent",
};

const CLOSE_REASON_ITEMS = Object.entries(CLOSE_REASON_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type Unconfirmed = Extract<InspectUnconfirmedSendOutput, { state: "unconfirmed" }>;

export function ResolveSendDialog({
  item,
  onDone,
}: {
  item: ScheduledSendItem;
  onDone: () => void;
}) {
  const scope = useMailboxScope();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<InspectUnconfirmedSendOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<SendCloseReason>("not-delivered");
  const [note, setNote] = useState("");

  function close() {
    setOpen(false);
    setView(null);
  }

  async function inspect() {
    setLoading(true);
    try {
      setView(await orpc.mail.scheduledSend.unconfirmed({ ...scope, id: item.id }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load this send");
      close();
    } finally {
      setLoading(false);
    }
  }

  function changeOpen(next: boolean) {
    if (busy) return;
    if (!next) {
      close();
      return;
    }
    setOpen(true);
    void inspect();
  }

  async function resolve(
    unconfirmed: Unconfirmed,
    decision:
      | { outcome: "verified"; providerMessageId: string }
      | { outcome: "closed"; reason: SendCloseReason; note: string | null },
  ) {
    setBusy(true);
    try {
      const result = await orpc.mail.scheduledSend.resolve({
        ...scope,
        id: item.id,
        nodeRunId: unconfirmed.nodeRunId,
        decision,
      });
      toast.success(result.message);
      close();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "This send could not be resolved");
      await inspect();
    } finally {
      setBusy(false);
    }
  }

  const unconfirmed = view?.state === "unconfirmed" ? view : null;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="xs"
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            <ShieldQuestion className="size-3" />
            Resolve
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve an unconfirmed send</DialogTitle>
          <DialogDescription>
            Sending started, but the provider never confirmed whether the message went out. It is
            never sent again automatically, because that could deliver it twice. Confirm it from the
            Sent folder, or close it without resending.
          </DialogDescription>
        </DialogHeader>

        {loading && !view ? (
          <div className="flex items-center gap-2 py-6 text-[12px] text-faint">
            <Loader2 className="size-3.5 animate-spin" />
            Checking the Sent folder…
          </div>
        ) : view?.state === "none" ? (
          <p className="text-[12px] text-faint">This send no longer has an unconfirmed outcome.</p>
        ) : unconfirmed ? (
          <div className="grid gap-4">
            {unconfirmed.error && (
              <p className="rounded-md bg-hover px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {unconfirmed.error}
              </p>
            )}

            {!unconfirmed.settled ? (
              <p className="text-[12px] text-faint">
                This run is still being handled. Wait for it to finish, then resolve the send.
              </p>
            ) : (
              <>
                <section className="grid gap-2">
                  <h3 className="text-[11px] uppercase tracking-[1.5px] text-faint">
                    Found in Sent
                  </h3>
                  {unconfirmed.notice && (
                    <p className="text-[12px] text-faint">{unconfirmed.notice}</p>
                  )}
                  {unconfirmed.lookupError ? (
                    <p className="text-[12px] text-destructive-text">{unconfirmed.lookupError}</p>
                  ) : unconfirmed.candidates.length === 0 ? (
                    <p className="text-[12px] text-faint">
                      No message in the most recent Sent mail matches this one&rsquo;s sender,
                      subject and recipients after it was dispatched, so delivery cannot be
                      confirmed.
                    </p>
                  ) : (
                    <ul className="grid gap-2">
                      {unconfirmed.candidates.map((candidate) => (
                        <li
                          key={candidate.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] text-foreground">
                              {candidate.subject || "(no subject)"}
                            </div>
                            <div className="truncate text-[11px] text-faint">
                              To: {candidate.to.join(", ")} ·{" "}
                              {new Date(candidate.date).toLocaleString()}
                            </div>
                          </div>
                          <Button
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                              resolve(unconfirmed, {
                                outcome: "verified",
                                providerMessageId: candidate.id,
                              })
                            }
                          >
                            <CheckCircle2 className="size-3" />
                            This is it
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="grid gap-2">
                  <h3 className="text-[11px] uppercase tracking-[1.5px] text-faint">
                    Close without resending
                  </h3>
                  <Select
                    items={CLOSE_REASON_ITEMS}
                    value={reason}
                    onValueChange={(value) => {
                      if (isOneOf(SEND_CLOSE_REASONS, value)) setReason(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOSE_REASON_ITEMS.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={note}
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why (optional)"
                    className="min-h-16 text-[13px]"
                  />
                  <p className="text-[11px] text-faint">
                    Closing records your decision; it is not a delivery receipt. The unconfirmed
                    outcome stays in the history, nothing after the send runs, and the stored copy
                    of the message is discarded. To send it again, write a new message.
                  </p>
                </section>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={close}>
            Not now
          </Button>
          {unconfirmed?.settled && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                resolve(unconfirmed, {
                  outcome: "closed",
                  reason,
                  note: note.trim() || null,
                })
              }
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Close without resending
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
