---
title: Cancel and retry runs
description: Stop a run that is waiting or running, and run the failed or blocked steps of a run again.
---

You can stop a run before it finishes, and you can retry a run that failed or was blocked. Both start from the run's details page. Anyone who can see a run can cancel or retry it.

To open a run, click **Workflows** in the left rail, click **Activity** at the bottom of the list, then click the run. You can also open a workflow, click a run in the **Runs** tab under the canvas, and click **Details**.

## Cancel a run

**Cancel run** appears at the top right of a run that is **pending** or **running**.

1. Open the run and click **Cancel run**.
2. The dialog **Cancel this run?** opens. Read what it says, then click **Cancel run** to confirm, or **Keep running** to leave the run alone.

What happens depends on the state of the run:

- **The run has not started its next attempt yet.** None of its remaining steps run.
- **The run is running now.** It stops before its next step. A step that is already in progress cannot be called back and may still finish. Nothing the run already did to your mail is undone.

Either way, the workflow itself stays enabled, and the steps that finished stay in the history. A message at the bottom of the screen confirms the result, for example "Cancelled" or "Cancellation recorded". If the run had already finished, the message says so and nothing changes.

A run you cancel while it is running shows the status **stopping**, with a note that it stops before its next step. Once the step that was in progress is done, its outcome appears in the run details.

To stop a workflow from running again, turn it off. See [Manage workflows](/guide/workflows/manage-workflows).

## Retry a run

**Retry failed steps** appears at the top right of a run whose status is **failed**, **partial** or **blocked**.

1. Fix the cause first. The run's **Error** and the step rows say what went wrong, for example "AI is turned off for this mailbox".
2. Open the run and click **Retry failed steps**.
3. The dialog **Retry this run?** opens. Click **Retry failed steps** to confirm, or **Not now** to go back.

The run is queued again and starts shortly after. A message says how many steps will run again and how many keep their results.

How a retry works:

- **Only the steps that failed or were blocked run again.** Steps that completed keep their results and do not run a second time, so nothing that was already done to your mail is done twice.
- **The retry uses the version that ran.** Even if you edited the workflow since, the retry follows the saved version the run started with.
- **The run keeps its place in the history.** It does not appear as a new run.
- **Answered questions are not asked again.** If an **Ask** step already finished, its answers are kept.

### When a run cannot be retried

The retry is refused, with a message that says why, when:

| Situation                                                                               | What to do                                           |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| The run is still queued or running.                                                     | Wait for it to finish.                               |
| The run completed.                                                                      | Nothing to retry.                                    |
| The run was cancelled.                                                                  | A cancelled run cannot be resumed.                   |
| The workflow is turned off.                                                             | Turn it back on, then retry.                         |
| The workflow was deleted.                                                               | Its runs can no longer be retried.                   |
| The run finished more than 7 days ago.                                                  | Its saved results are gone, so it cannot be retried. |
| The person the workflow runs as left the workspace or lost access to a mailbox it uses. | Restore access to it before retrying.                |
| The saved version is no longer valid.                                                   | Nothing in this run can be retried.                  |
| Every step either completed or needs review.                                            | Nothing is left to retry.                            |
