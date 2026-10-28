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

import { isOneOf } from "@/lib/guards";
import type { SendCloseReason } from "@/server/schema";
import { SEND_CLOSE_REASONS } from "@/workflow/schema";

export interface ResolveCandidate {
  id: string;
  title: string;
  subtitle: string;
  at: string | null;
}

export type ResolveView =
  | { state: "none" }
  | {
      state: "unconfirmed";
      stepRunId: string;
      settled: boolean;
      reconcilable: boolean;
      error: string | null;
      candidates: ResolveCandidate[];
      lookupError: string | null;
      notice: string | null;
    };

type Unconfirmed = Extract<ResolveView, { state: "unconfirmed" }>;

export type ResolveDecision =
  | { outcome: "verified"; candidateId: string }
  | { outcome: "closed"; reason: SendCloseReason; note: string | null };

export interface ResolveCopy {
  title: string;
  description: string;
  checking: string;
  found: string;
  empty: string;
  close: string;
  closeNote: string;
  reasons: Record<SendCloseReason, string>;
}

export const SEND_COPY: ResolveCopy = {
  title: "Resolve an unconfirmed send",
  description:
    "Sending started, but the provider never confirmed whether the message went out. It is never sent again automatically, because that could deliver it twice. Confirm it from the Sent folder, or close it without resending.",
  checking: "Checking the Sent folder…",
  found: "Found in Sent",
  empty:
    "No message in the most recent Sent mail matches this one’s sender, subject and recipients after it was dispatched, so delivery cannot be confirmed.",
  close: "Close without resending",
  closeNote:
    "Closing records your decision; it is not a delivery receipt. The unconfirmed outcome stays in the history, nothing after the send runs, and the stored copy of the message is discarded. To send it again, write a new message.",
  reasons: {
    "reported-delivered": "I believe it was delivered",
    "not-delivered": "It was not delivered",
    abandoned: "I no longer want it sent",
  },
};

const STEP_REASONS: Record<SendCloseReason, string> = {
  "reported-delivered": "I believe it went through",
  "not-delivered": "It did not go through",
  abandoned: "I no longer want it done",
};

const STEP_CLOSE_NOTE =
  "Closing records your decision; it is not a receipt. The unconfirmed outcome stays in the history and nothing after this step runs.";

const EVENT_COPY: ResolveCopy = {
  title: "Resolve an unconfirmed event",
  description:
    "Creating the event started, but the provider never confirmed whether it was made. It is never retried automatically, because that could create it twice. Confirm it from the calendar, or close it without retrying.",
  checking: "Checking the calendar…",
  found: "Found in the calendar",
  empty:
    "No event in the calendar has this step’s title and start time, so it cannot be confirmed.",
  close: "Close without retrying",
  closeNote: STEP_CLOSE_NOTE,
  reasons: STEP_REASONS,
};

const RESPONSE_COPY: ResolveCopy = {
  title: "Resolve an unconfirmed response",
  description:
    "Responding to the invitation started, but the provider never confirmed it. It is never retried automatically. Confirm it from the event, or close it without retrying.",
  checking: "Checking the event…",
  found: "Found on the event",
  empty: "The event does not show this response, so it cannot be confirmed.",
  close: "Close without retrying",
  closeNote: STEP_CLOSE_NOTE,
  reasons: STEP_REASONS,
};

const FILE_COPY: ResolveCopy = {
  title: "Resolve an unconfirmed upload",
  description:
    "Writing the file started, but the provider never confirmed whether it was saved. It is never retried automatically, because that could save it twice. Confirm it from the drive, or close it without retrying.",
  checking: "Checking the drive…",
  found: "Found in the drive",
  empty:
    "No file in the destination folder has this name and was changed around the time the step ran, so it cannot be confirmed.",
  close: "Close without retrying",
  closeNote: STEP_CLOSE_NOTE,
  reasons: STEP_REASONS,
};

const OTHER_COPY: ResolveCopy = {
  title: "Resolve an unconfirmed step",
  description:
    "This step started, but the provider never confirmed whether it finished. It is never retried automatically, because that could do it twice. Check the provider yourself, then close it.",
  checking: "Loading…",
  found: "Found",
  empty: "This step cannot be checked at the provider.",
  close: "Close without retrying",
  closeNote: STEP_CLOSE_NOTE,
  reasons: STEP_REASONS,
};

export function resolveCopyFor(step: string): ResolveCopy {
  if (step.startsWith("mail.send") || step === "mail.reply" || step === "mail.forward") {
    return SEND_COPY;
  }
  if (step === "calendar.create") return EVENT_COPY;
  if (step === "calendar.respond") return RESPONSE_COPY;
  if (
    step === "drive.write" ||
    step === "drive.copy" ||
    step === "mail.saveAttachment" ||
    step === "mail.saveEml"
  ) {
    return FILE_COPY;
  }
  return OTHER_COPY;
}

export function ResolveDispatchDialog({
  copy,
  load,
  submit,
  onDone,
}: {
  copy: ResolveCopy;
  load: () => Promise<ResolveView>;
  submit: (stepRunId: string, decision: ResolveDecision) => Promise<{ message: string }>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ResolveView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<SendCloseReason>("not-delivered");
  const [note, setNote] = useState("");
  const reasonItems = Object.entries(copy.reasons).map(([value, label]) => ({ value, label }));

  function close() {
    setOpen(false);
    setView(null);
  }

  async function inspect() {
    setLoading(true);
    try {
      setView(await load());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load this step");
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

  async function resolve(unconfirmed: Unconfirmed, decision: ResolveDecision) {
    setBusy(true);
    try {
      const result = await submit(unconfirmed.stepRunId, decision);
      toast.success(result.message);
      close();
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "This step could not be resolved");
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
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {loading && !view ? (
          <div className="flex items-center gap-2 py-6 text-[12px] text-faint">
            <Loader2 className="size-3.5 animate-spin" />
            {copy.checking}
          </div>
        ) : view?.state === "none" ? (
          <p className="text-[12px] text-faint">This step no longer has an unconfirmed outcome.</p>
        ) : unconfirmed ? (
          <div className="grid gap-4">
            {unconfirmed.error && (
              <p className="rounded-md bg-hover px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {unconfirmed.error}
              </p>
            )}

            {!unconfirmed.settled ? (
              <p className="text-[12px] text-faint">
                This run is still being handled. Wait for it to finish, then resolve the step.
              </p>
            ) : (
              <>
                {unconfirmed.reconcilable && (
                  <section className="grid gap-2">
                    <h3 className="text-[11px] uppercase tracking-[1.5px] text-faint">
                      {copy.found}
                    </h3>
                    {unconfirmed.notice && (
                      <p className="text-[12px] text-faint">{unconfirmed.notice}</p>
                    )}
                    {unconfirmed.lookupError ? (
                      <p className="text-[12px] text-destructive-text">{unconfirmed.lookupError}</p>
                    ) : unconfirmed.candidates.length === 0 ? (
                      <p className="text-[12px] text-faint">{copy.empty}</p>
                    ) : (
                      <ul className="grid gap-2">
                        {unconfirmed.candidates.map((candidate) => (
                          <li
                            key={candidate.id}
                            className="flex items-center gap-3 rounded-lg border border-border p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] text-foreground">
                                {candidate.title || "(untitled)"}
                              </div>
                              <div className="truncate text-[11px] text-faint">
                                {candidate.subtitle}
                                {candidate.at && ` · ${new Date(candidate.at).toLocaleString()}`}
                              </div>
                            </div>
                            <Button
                              size="xs"
                              disabled={busy}
                              onClick={() =>
                                resolve(unconfirmed, {
                                  outcome: "verified",
                                  candidateId: candidate.id,
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
                )}

                <section className="grid gap-2">
                  <h3 className="text-[11px] uppercase tracking-[1.5px] text-faint">
                    {copy.close}
                  </h3>
                  <Select
                    items={reasonItems}
                    value={reason}
                    onValueChange={(value) => {
                      if (isOneOf(SEND_CLOSE_REASONS, value)) setReason(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reasonItems.map((entry) => (
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
                  <p className="text-[11px] text-faint">{copy.closeNote}</p>
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
              {copy.close}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
