# Workflow engine — graphs, node kinds and execution semantics

What a workflow is: its tables, how a node kind is built, mailbox sources, merges and joins, the decision steps, triggers and occurrences, retry classes, the principal a run acts as, and the built-in workflows.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [workflow-runtime.md](workflow-runtime.md), [workflow-runs.md](workflow-runs.md), [ai-agents.md](ai-agents.md).

## Code map

| Concern                                      | Where                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                                       | `src/db/schema.ts` → `workflow`, `workflowRevision`, `workflowResource`, `workflowTrigger`, `workflowOccurrence`, `workflowRun`, `workflowNodeRun`, `workflowPayload`                                                                                             |
| Client-safe graph contracts                  | `src/workflow/schema.ts` → `graphSchema`, `MAX_MERGE_INPUTS`, `BARRIER_INPUT_KEY`, `DECISION_QUESTION_TYPES`, `DECISION_BODY_MAX` · shared runtime types `src/workflow/runtime.ts` → `RetryClass`                                                                 |
| Node kind definitions                        | `src/workflow/kinds/<kind>.ts` (kind `a.bC` lives in `a-b-c.ts`, e.g. `trigger.newMail` → `trigger-new-mail.ts`) · `src/workflow/kinds/index.ts` → `NODE_KINDS`, `nodeOutputs`, `outputLabel`, `edgeLabel` · `src/workflow/kinds/types.ts` → `NodeKindDefinition` |
| Node handlers                                | `src/workflow/handlers/<kind>.ts` · `src/workflow/handlers/index.ts` → `HANDLERS` · shared runtime `src/workflow/nodes.ts` → `NodeContext`, `moveAction`                                                                                                          |
| Builder cards                                | `src/app/w/[slug]/workflow/_components/nodes/<kind>.tsx` · `nodes/index.ts` → `nodeTypes` · `nodes/node-frame.tsx` → `NodeFrame` · canvas `workflow-canvas.tsx`, `workflow-builder.tsx`                                                                           |
| React Flow ⇄ graph                           | `src/workflow/graph.ts` → `toFlow`                                                                                                                                                                                                                                |
| Graph-wide validation                        | `src/workflow/validation.ts` → `validateGraph`                                                                                                                                                                                                                    |
| Executor                                     | `src/workflow/executor.ts` → `executeRun`, `receiptFor`                                                                                                                                                                                                           |
| Domain ops shared by oRPC, MCP and the agent | `src/workflow/index.ts` → `createUserWorkflow`                                                                                                                                                                                                                    |
| Discovery and occurrences                    | `src/workflow/triggers.ts` → `discoverTrigger`, `discoverOnce` · `src/workflow/store.ts` → `openOccurrence`, `retargetSnooze` · `src/workflow/cron.ts` → `nextCronAt`                                                                                             |
| Decision steps                               | `src/workflow/decision.ts` → `buildDecisionState` · `src/workflow/preview.ts` → `previewDecision` · `src/workflow/handlers/decision-ask.ts`, `decision-branch.ts` · preview UI `decision-preview-sheet.tsx`                                                       |
| Background principal                         | `src/workflow/authorization.ts` → `resolvePrincipal`, `authorizeMailboxAi`                                                                                                                                                                                        |
| Built-ins                                    | `src/workflow/builtins/scheduled-send.ts` → `scheduleSend` · `snooze.ts` → `snoozeMessage` · `before-send.ts` → `prepareOutgoing` · `system.ts` → `ensureSystemWorkflows`, `CIMD_PRUNE_ID`                                                                        |
| Procedures                                   | `src/server/routes/workflows.ts` · `src/server/routes/mail/scheduled-send.ts` · snooze in `src/server/routes/mail/messages.ts`                                                                                                                                    |

## Rules

### Storage

- **A workflow is a node graph with immutable revisions.** Its tables reference mailboxes through real FKs (`workflow_resource`), and their unique keys make every step idempotent.
  - One occurrence per trigger and key, one run per occurrence, one node run per run, node and input key.
  - So a retried run redoes only the node runs that did not complete: a successful send followed by a failed tag retries the tag only.
- **Kind-specific ownership is enforced by CHECK constraints** in `src/db/schema.ts`.
- **Scheduled-mail bytes live in `workflow_payload`, apart from execution metadata.** The payload is dropped once the send completes or the item is cancelled, and kept on a failed, blocked or `unknown` outcome so the send can still be reconciled.
- **Every node run, the barrier included, is created by one `INSERT … SELECT … FROM workflow_run WHERE id = ? AND lease_token = ?`**, so a stale lease inserts nothing. One statement makes the lease fence and the insert one atomic step that takes the write lock once.

### Node kinds

- **Every step kind is three files and every trigger kind two, and the build breaks until all of them exist.** `NODE_KINDS` and `nodeTypes` are typed over every kind, `HANDLERS` over every kind except `trigger.*`, which discovery fires.
  - The definition (`kinds/<kind>.ts`, client-safe), with its `retry` class (`dispatch` is what makes a step a send) and its own `check(node, ctx)`.
  - For a step kind, the server handler (`handlers/<kind>.ts`), over the shared runtime in `nodes.ts`.
  - The builder card (`_components/nodes/<kind>.tsx`), built on `NodeFrame` (a shadcn `Card` whose input and output handles come from the definition).
- **`validation.ts` holds only whole-graph rules, then runs each kind's `check`.** An edge from an output a node does not declare fails with that kind's `outputError`.
- **Outputs and their labels are read only through `nodeOutputs` / `outputLabel`**: by the builder canvas, `toFlow`, edge labels and run history alike.
- **Edges are named by their steps** (`edgeLabel`: "If (Yes) to Apply label"), in the builder and in run history.
- **Validation is a real port-type pass over the DAG.** Dangling edges, wrong data kinds, unreachable steps, cycles, out-of-scope mailboxes, bad cron and unknown time zones all fail with the offending node id.

### Mailboxes and merges

- **A mailbox is an ordinary node.** `mailbox.source` carries its own `mailboxId` and an operation; conditions expose `matched` and `unmatched` outputs; actions consume typed envelopes.
- **`incoming` only runs under `trigger.newMail`, and a `trigger.newMail` feeds exactly one mailbox.** Several sources are several triggers, each with its own baseline, cursor and occurrences, and a run executes only its own trigger's branch.
- **Mailbox identity rides the envelope and its checkpoint key (`<nodeId>:<mailboxId>:<itemId>`)**, so the same provider message id in two mailboxes never collides.
- **Each ordinary step takes one incoming edge; only the merge steps take several.** Each edge into a merge names its typed mail input in `targetHandle` (`in:<n>`, up to `MAX_MERGE_INPUTS`); every input must carry mail.
- **`merge.append` acts on a message once even when it arrives by two paths.** It appends inputs in input-number order, re-keys each item to `<mergeId>:<mailboxId>:<messageId>` and drops repeats; its per-input node runs let a retried or crashed run add only what a failed input missed.
- **`merge.join` ("Wait for all") releases only when every input reachable from this run's trigger has settled**, and emits the same deduplicated, input-ordered stream as append.
  - An input that found nothing, or whose condition filtered everything, counts as settled.
  - An input whose branch failed, was blocked or was cut by the tick budget holds the join and everything below it.
  - Inputs belonging to another trigger are never awaited.
- **A failure upstream holds the barrier even through a condition or an append.** The executor carries a per-node branch state (settled / pending / blocked / failed, worst-of along each path); `merge.append` carries on past a failed input, but its branch state stays failed.
- **A released join never re-evaluates.** The barrier is a node run with input key `barrier` (`BARRIER_INPUT_KEY`) holding each input's state and item count; it carries no message data, so it is kept when a run settles, and a resumed run trusts a `completed` barrier.

### Decisions

- **Ask and Branch are reads.** They are not `action.*`, so they take no budget reserve and an abort is `failed` + retryable. A completed Ask replays its stored answers, so a resumed run never asks again.
- **Validation refuses Ask and Branch when `decisionEnabled("workflowNode")` is false, under `trigger.beforeSend`, and when any mailbox feeding an Ask has AI off (`aiMailboxIds`).**
- **At run time a decision problem blocks the run**, so it resumes once fixed: the switch off, a `DecisionConfigError`, or AI off for the mailbox (`authorizeMailboxAi`) all throw `BlockedError`.
- **"Try on recent mail" is a non-modal sheet without an overlay** (`decision-preview-sheet.tsx`), because it tells the user to move Branch thresholds while the canvas stays usable.

### Triggers and sends

- **Occurrence identity is the deduplication.** A new-mail scan opens one occurrence per provider message id, a schedule one per fired instant, a one-shot one per its instant, all behind a unique index, so overlapping ticks and several workers cannot double-run.
- **A send never resends automatically.** It persists `dispatching` before it leaves and records the provider receipt; an attempt that ends without a conclusive result settles as `unknown`, for a person to reconcile ([workflow-runs.md](workflow-runs.md)).
- **A blocked step keeps its reason.** A `BlockedError` message is written for the user (for example "AI is turned off for this mailbox"), so the executor stores it as-is.
- **Background access carries its own principal.** `authorization.ts` re-checks membership, mailbox visibility and connection health before every side effect, so a detached mailbox or a departed member blocks pending actions with a visible reason.

### Built-ins

- **Built-ins (send later, snooze, CIMD prune, auto-BCC) are ordinary workflows** with the graphs below.
- **A snooze restore follows only a checkpointed archive.** The snooze definition is saved disabled and the tick enables it only when the archive node checkpoints, and `discoverOnce` refuses to fire a snooze wake without that checkpoint.
- **A snooze follows its message when archiving gives it a new id.**
  - The archive and restore steps run through `moveAction`, which passes the moved id downstream ([mail.md](mail.md)).
  - For a snooze, the archive step then calls `retargetSnooze`, which writes a revision whose mailbox sources point at the archived message and re-points the triggers to it.
  - `targetKey` keeps the original id as the snooze's handle; `unsnoozeMessage` restores whatever the definition currently points at.
- **Cancelling a built-in is atomic against dispatch**, and reports the real outcome when dispatch has already started ([workflow-runs.md](workflow-runs.md)).
- **Auto-BCC runs the interpreter pure on a `trigger.beforeSend` graph**: it may amend the draft, but it may not schedule work or touch a provider.

## How it works

- **Revision snapshots.** Saving a workflow writes a new immutable `workflow_revision`; a run carries its `revision_id` and executes that revision.
- **Fan-out.** A schedule or manual trigger fans out to one `mailbox.source` (operation `list`) per mailbox, each driving its own branch of conditions and actions. `WorkflowSummary.sources` reports each new-mail source's baseline, last scan and error.
- **Schedules.** Recurring schedules coalesce a backlog into one overdue occurrence (`coalesceMissed`; `cron-parser`, five fields, explicit IANA zone, UTC instants stored). One-shots always run once when service resumes.
- **New mail.** A new-mail trigger takes a baseline when enabled: existing messages get occurrence rows with no run, so the unique index, not the rolling seen-cache, excludes them. A periodic sweep re-reads the folder (`src/workflow/triggers.ts`), so an arrival a provider lists out of order is still caught.
- **Enable / disable.** Disabling stops discovery; re-enabling resets the next recurring instant and the baseline.
- **Retry classes.** `dispatch` marks a send (`action.send`) and follows the send rules above; every other kind is `safe` (reads and idempotent state changes), retried with exponential backoff and jitter.
- **Late provider results.** An `unknown` mutation blocks cancellation of its item. If the abandoned provider call later settles in a still-running process, the node run is reconciled to its real outcome; a late-completed snooze archive arms its wake.
- **Ask (`decision.ask`).** One decision call per message sends the fields picked in `state.fields` and every question in `questions`.
  - The body is capped (`DECISION_BODY_MAX`), and the full message is loaded only when `body` or `hasAttachment` is picked.
  - It emits the message on one output per question with that question and its answer attached to the envelope; a question with nothing connected is still asked.
  - Usage is one `workflow-decision` row per call with the run id.
- **Branch (`decision.branch`).** It takes exactly one question output, makes no call, and routes on the attached answer with its own thresholds to the answer's outputs, or `unsure` otherwise (including a refusal). Each item's receipt is `operation: "decide"`, which run history shows per item.
- **"Try on recent mail"** (`workflows.previewDecision`) asks the same questions about the latest inbox messages and acts on nothing. The `previewDecision` agent and MCP tool call the same `src/workflow/preview.ts` → `previewDecision`, which owns the per-user rate limit.
- **The built-in graphs.**
  - Send later: `at-time → sender mailbox → send → scheduled label`.
  - Snooze: one definition holding a manual `mailbox → archive` branch and a durable `at-time → mailbox → restore` branch.
  - `system:cimd-prune` (`CIMD_PRUNE_ID`): an hourly schedule around `pruneAbandonedCimdClients()` ([mcp.md](mcp.md)).
  - `system:audit-prune` (`AUDIT_PRUNE_ID`): a daily schedule around `pruneAuditEvents()` ([audit.md](audit.md)).
  - Auto-BCC: a `trigger.beforeSend` graph run by `prepareOutgoing`.
