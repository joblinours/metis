# Workflow runs — cancel, resume, reconciliation and history

What can be done to one run after it exists (cancelling it, resuming its failed steps, resolving an unconfirmed send by hand) and what a caller may see of a run. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [workflow-graph.md](workflow-graph.md), [workflow-runtime.md](workflow-runtime.md), [mail.md](mail.md).

## Code map

| Concern                  | Where                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancel                   | `src/workflow/store.ts` → `cancelRun`, `closeStrandedCancels` · executor check `src/workflow/executor.ts` → `isCancelled` · domain op `src/workflow/index.ts` → `cancelWorkspaceRun`                                                                                                                          |
| Resume                   | `src/workflow/store.ts` → `resumeRun`, `settleRun`, `expireRetainedOutputs` · `src/workflow/resume.ts` → `resumeCheckedRun` (and its refusal messages) · domain op `src/workflow/index.ts` → `resumeWorkspaceRun`                                                                                             |
| Unconfirmed sends        | `src/workflow/reconcile.ts` → `findUnconfirmedSend`, `resolveUnconfirmedSend`, `dispatchWindow`, `SENT_SCAN_PAGES`, `CLOCK_SKEW_MS`, `DISPATCH_GRACE_MS` · `src/workflow/fingerprint.ts` → `sendFingerprint` · `src/workflow/store.ts` → `resolveSendNodeRun`, `finishResolution`, `finishPendingResolutions` |
| Scheduled-send surfaces  | `src/workflow/builtins/scheduled-send.ts` → `retryScheduledSend` · procedures `mail.scheduledSend.*` in `src/server/routes/mail/scheduled-send.ts` · UI `src/app/w/[slug]/m/[mailbox]/scheduled/_components/{scheduled-view,resolve-send-dialog}.tsx`                                                         |
| Run visibility           | `src/workflow/index.ts` → `canSeeRun` · `src/workflow/store.ts` → `loadRunDetail`                                                                                                                                                                                                                             |
| Run procedures and tools | `src/server/routes/workflows.ts` · toolkit `src/mastra/toolkit/workflow.ts` → `cancelWorkflowRun`, `resumeWorkflowRun` · surfaces `src/mastra/tools/workspace-workflow-tools.ts`, `src/mastra/mcp/tools/workflows.ts`                                                                                         |
| Run history UI           | `src/app/w/[slug]/workflow/history/_components/workflow-history.tsx` · run detail `src/components/workflow-history/` → `workflow-run-detail.tsx` ("Retry failed steps"), `workflow-run-graph.tsx`, `run-graph-elements.ts` → `buildRunNodes`, `RUN_ROW`                                                       |

## Rules

### Cancel

- **A cancel changes only the run, and a cancel that loses the race to the last side effect reports the real outcome.** A run the worker already finished reports `finished` with its real status.
- **`cancelRun` is one transaction.**
  - A `pending` run (queued or waiting on a retry) flips to `cancelled` at once.
  - A `running` run is marked `cancelled` while keeping its lease, so the executor's `isCancelled` checks stop it before its next side effect and the worker settles it.
- **A step that was about to start when the cancel landed is recorded `skipped`.**
- **Settle and release leave a cancelled run cancelled**; neither requeues it.

### Resume

- **A run can be resumed, never replayed.** `resumeRun` re-queues the same run (same revision, same occurrence) as `pending` with its attempts reset.
  - The executor skips every node run already `completed` for its run / node / input key and reclaims only the `failed` / `blocked` ones, so a completed send or action is never repeated.
- **Resume depends on retained checkpoints.** Settling a `failed` / `partial` / `blocked` run of a `user` or `scheduled-send` workflow keeps its checkpointed outputs (`settleRun({ retainOutputs })`) for `RESUME_WINDOW_MS`; `expireRetainedOutputs` clears them in every tick after that.
  - Completed and cancelled runs clear at settle; deleting a workflow or cancelling a scheduled send clears them at once.
  - A receipted scheduled send has recipients, sender and subject blanked from its kept envelopes (`redactSentOutputs`).
- **Every refusal to resume carries an actionable message**; the refusals and their messages are in `resume.ts`.
- **The resume claim is one conditional `UPDATE` fenced on status, `finished_at` and a null lease**, so the check and the claim are one atomic step and simultaneous requests claim it once.
- **A step that never started counts as retryable only when a send verified by a person feeds it**; that is how a verified send's follow-up runs.

### Unconfirmed sends

- **An unconfirmed send is resolved by a person, once, and never by resending.**
- **Resolution is single-shot**: one conditional `UPDATE` reads the status and requires `resolved_at IS NULL` and a settled, unleased run.
  - A late in-process provider result cannot overwrite a resolved send, because `reconcileNodeRun` requires `resolved_at IS NULL` too.
  - A resolved send stays resolved when its run is cancelled.
  - A delivery claim is recorded as the person's decision, not as a provider receipt.
- **A send is verified only when the picked Sent message meets every check below**, all inside the one `UPDATE` that resolves it.
  - **Found in the Sent listing:** by id, in the sender mailbox's Sent listing, at most `SENT_SCAN_PAGES` pages, read under the scheduling principal. `getMessage` is not used, because Gmail, Microsoft and Zoho return only the id and body from it.
  - **Sender and subject** match exactly, with "(no subject)" counting as empty.
  - **To and Cc** are compared as two separate address sets, each equal to the payload's, including when empty.
  - **Bcc** is compared whenever the Sent copy shows it, and must then equal the payload's, even when the payload had none.
  - **Date:** between `CLOCK_SKEW_MS` before and `DISPATCH_GRACE_MS` after the send step's `started_at` (`dispatchWindow`). That column is written only when a node run is created or reclaimed, and a `dispatching` / `unknown` run is never reclaimed, so later re-marks cannot move it.
  - **Unique:** it is not another run's receipt, and not indistinguishable from an id-less completed send in that mailbox (Microsoft returns a `null` id) that settled within `CLOCK_SKEW_MS` of it with the same `fingerprint`. A receipt with no fingerprint counts as indistinguishable; an unrelated id-less send nearby does not block.
- **Whether a Sent copy shows Bcc depends on the provider.**
  - The Resend and Cloudflare gateways store Bcc on sent mail; Gmail, Microsoft and Zoho list none.
  - On IMAP a copy shows it only if its raw message carries a Bcc header, and the copy Metis files itself (`MailComposer` in `src/mail/providers/imap.ts`) omits it.
  - On a copy that hides Bcc an extra Bcc goes unnoticed, which is why To, Cc, subject, sender and time must each match on their own.

### Visibility

- **A run's detail and listing hide what the caller cannot see, not just what the run touched.** `getWorkspaceRun` / `listWorkspaceRuns` omit a run outright unless the caller is its principal or can see every mailbox in its executed revision (`canSeeRun`, shared by both).

## How it works

- **Stuck cancels.** A cancelled run whose lease expires (its worker died) is closed on cancel or by `closeStrandedCancels` at the next tick, which turns its in-flight action steps into `unknown`. "Stopping" is `status = cancelled` with no `finishedAt`; `hasInFlightRun` counts it, so discovery waits for it.
- **Resume surfaces.**
  - `workflows.resumeRun` and "Retry failed steps" on the run detail.
  - `resumeWorkflowRun` on the workspace agent (approval) and MCP (`sensitive: true`).
  - `mail.scheduledSend.retry` (the latest run of that scheduled message, mailbox-scoped like `cancel`) in the scheduled view.
- **Resolving.** `mail.scheduledSend.unconfirmed` shows the candidates and `.resolve` records the outcome, from the scheduled view's Resolve dialog, with who, when and why.
  - **Verified:** the node becomes `completed` with a real receipt and keeps its original `finished_at`.
  - **Closed:** the node stays `unknown` with its error and no receipt, the payload and outputs are dropped, and resume refuses with `send-closed`.
- **Cleanup after a resolution.**
  - `finishResolution` drops the payload, redacts or clears outputs and, for a verified send, calls `resumeCheckedRun` for the follow-up; it marks the resolution finished last.
  - `finishPendingResolutions` re-runs it in every tick for a bounded batch of unfinished resolutions, oldest first; a cleanup that throws is deferred by `FINISH_RETRY_MS`, so failing rows cannot starve newer ones.
  - So a crash between the update and the cleanup never leaves a payload, unredacted outputs, or a verified send without its follow-up.
- **Fingerprint.** `sendFingerprint` hashes the normalized subject plus the To and Cc address sets, stored on every send receipt.
- **Run history.**
  - Each item names the message it handled: the executor stores its subject and sender in the node run's `receipt.message` (`receiptFor`), because outputs are cleared once a run settles; `getWorkspaceRun` reads it, falling back to retained outputs (`messagesIn`). Dispatch steps keep their own receipt on failure.
  - The executor writes the outputs each node run sent items on to `workflow_node_run.output_handles`, which decides the edges history draws as taken and the output labels an item shows.
  - The executor reports `pending` rather than `completed` when a run was interrupted with nothing failed.
- **What an openable run still hides.**
  - The returned graph has every mailbox step's `messageId`, `threadId` and `query` stripped; the stored revision keeps them.
  - An item whose mailbox the caller has since lost drops its detail and error but keeps its status.
  - Any address in the run's error that is not one of the caller's visible mailboxes reads `[hidden address]`.
  - A summary line loses its detail (keeping status and count) when its step's mailbox, any of its items' mailboxes, or an address in its text is hidden from the caller.
  - Each edge's `carried` is derived server-side from data that survives settling, and is `null` whenever the underlying step's mailbox is hidden.
- **The run-detail graph keeps each step's column but not its height.** Run nodes are much shorter than the editor's, so `buildRunNodes` ranks the revision's distinct `y` values and stacks the rows `RUN_ROW` apart, keeping the graph at a readable zoom.

## Deliberate limits

- **Resolving an unconfirmed send is human-only**: no agent or MCP tool exists for it.
- **A Bcc-only send whose Sent copy shows no Bcc cannot be verified.**
