---
title: Run a workflow and check its history
description: Test a workflow without changing anything, start it yourself with Run now, and see what every run did.
---

Most workflows run on their own, when mail arrives or on a schedule. You can also test one without changing anything, start one yourself, and always look back at what each run did.

## Test a workflow without changing anything

A test run goes through the workflow as it is on your screen, saved or not. It changes nothing in your mail: each action only reports what it would do. Testing does not count as a change to the workflow, and it does not appear under **Activity**.

1. Open the workflow.
2. Click **Test** in the top bar, or press **w** then **t**. The **Test run** tab opens under the canvas.
3. If the workflow has more than one trigger, pick the one to start from in the first list in the tab.
4. For a **When mail arrives** trigger, pick a message from the list next to **Run test**. The list shows the newest messages in the watched mailbox's inbox, as subject and sender. If the inbox is empty, it says "That inbox has no mail to test with."
5. Click **Run test**.

The tab shows the result, such as **Completed**, and the message it used. Below that is one row for each step the test reached, with what the step did. Click a row to select that step.

The canvas shows the test run too. Each step shows how it went, and the connections the mail took are highlighted. The tab's header says "Showing the test run on the canvas". Click a step to see each message it handled under **In the test run** in the Inspector. Actions say they were "not applied in a test run". Click **Clear** in the header to hide the test run.

Keep in mind:

- **Fix problems first.** **Run test** is greyed out while the workflow has problems, and the tab says "Fix the problems in the workflow before testing it."
- **A test needs a trigger that can run.** If the workflow only has a **Before a message is sent** trigger, the tab says "Add a new-mail, schedule or manual trigger to test from."
- **Ask steps still ask the AI model.** Everything else changes nothing.
- **You can run up to 10 tests a minute.** After that, you see "Too many requests. Please slow down."

## Run a workflow now

1. Click **Workflows** in the left rail, then click the workflow in the list.
2. Click **Run now** in the top bar, or press **w** then **r**. The button appears once the workflow is saved.

The **Runs** tab opens under the canvas, and the new run is drawn on the canvas while it happens. Each step shows its status and how many messages it handled, and the connections the mail took are highlighted. To see the full details, click **Details**.

Keep in mind:

- **Turn the workflow on first.** A run of a disabled workflow is cancelled before it does anything.
- **Run now runs the saved version.** If you have unsaved changes, you see "Running the saved version. Save to run your latest changes." Click **Save** first to run your changes.
- **The workflow needs a When run manually or On a schedule trigger.** Otherwise you see "Add a manual or scheduled trigger before running this workflow". A workflow that only reacts to new mail cannot be started by hand. Use **Test** instead.
- **A run acts for real.** It archives, labels or moves mail just as an automatic run would.

## See the runs of one workflow

The **Runs** tab under the canvas lists the last 20 runs of the workflow you have open. Each row shows the status, how many steps were done or failed, any error, and how long ago it ran. A new workflow says "Save the workflow to run it. Until then, try it with a test run." A saved one with no runs says "No runs yet. Press Run now, or wait for a trigger to fire."

Click a run to draw it on the canvas. A line above the list says "Showing run" followed by the first characters of the run's ID. If the workflow changed since then, it adds "It ran an earlier version of this workflow." Click a step to see each message it handled under **In the selected run** in the Inspector. While the run is going, the canvas updates every 2 seconds.

- Click **Details** to open the run's page. See [Read one run](#read-one-run).
- Click **Hide**, or click the run again, to stop showing it.

## See every run

Click **Activity** at the bottom of the workflow list. The **Workflow activity** page lists up to the latest 100 runs in the workspace that you can see, newest first, and refreshes on its own. To see the runs of one workflow, choose it in the list at the top right, which shows **All workflows** to start with.

<img src="/images/workflows/activity.png" alt="The Workflow activity page with a list of runs" class="dark:hidden" />
<img src="/images/workflows/activity-dark.png" alt="The Workflow activity page with a list of runs" class="hidden dark:block" />

Each run shows:

- An icon for its outcome, the workflow name, and how long ago it ran.
- Its status, plus "attempt" and a number when it was tried more than once.
- The error, if there was one.
- One small tag for each step that ran. "×3" after a step name means it ran for three messages. A question mark means the step needs review. A cross means the step failed.

If nothing has run yet, the page says "No runs recorded yet. Runs appear here once a trigger fires."

### Run statuses

| Status        | Meaning                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| **pending**   | Waiting to start.                                                                          |
| **running**   | Running now.                                                                               |
| **completed** | Every step that was reached finished.                                                      |
| **partial**   | Some steps finished, and others failed, were blocked or need review.                       |
| **failed**    | The run failed.                                                                            |
| **blocked**   | A step could not run until something is fixed, for example AI is turned off for a mailbox. |
| **cancelled** | Someone cancelled the run.                                                                 |
| **stopping**  | The run was cancelled while it was running, and it stops before its next step.             |

To retry a **failed**, **partial** or **blocked** run, see [Cancel and retry runs](/guide/workflows/cancel-and-retry-runs).

## Read one run

Click a run to open its details. The header shows the workflow name, the status and the run's ID. The back arrow returns to **Workflow activity**.

<img src="/images/workflows/run-detail.png" alt="The details of one run, with its facts, the graph and the selected Apply label step" class="dark:hidden" />
<img src="/images/workflows/run-detail-dark.png" alt="The details of one run, with its facts, the graph and the selected Apply label step" class="hidden dark:block" />

### The facts

| Fact          | What it shows                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**   | What started the run: "New mail arrived", "Schedule fired" or "Run manually". Details may follow below it. These are the time the run was for, the number of messages, how many missed scheduled times were combined, and who pressed **Run now**. |
| **Revision**  | The saved version that ran, and when it was saved. "current" means you have not changed the workflow since. Otherwise it says the workflow was edited or deleted since.                                                                            |
| **Runs as**   | The person the workflow runs as. "A former member" means that person has left the workspace.                                                                                                                                                       |
| **Timing**    | When the run started, when it finished and how long it took. A run that has not started shows when it is due.                                                                                                                                      |
| **Mailboxes** | The mailboxes the run used. A mailbox you cannot see shows "Unavailable mailbox".                                                                                                                                                                  |
| **Error**     | The reason the run failed, if it did.                                                                                                                                                                                                              |

### The graph

The **Graph** shows the workflow exactly as it was when it ran. Each step is coloured by what happened to it. The legend below the graph explains the colours: **Completed**, **Skipped**, **Failed**, **Blocked**, **Needs review**, **Not reached**, and **In progress or sending**. A solid line is a **Path taken**, and a dashed line is **Not taken**.

Click a step to open its details in a card below the graph. Click **Close step detail** to close it. On a touch screen, tap **Move the graph** to pan and zoom, and **Stop moving the graph** when you are done.

<img src="/images/workflows/run-selected-step.png" alt="The details card for the selected Apply label step, listing each message it labelled" class="dark:hidden" />
<img src="/images/workflows/run-selected-step-dark.png" alt="The details card for the selected Apply label step, listing each message it labelled" class="hidden dark:block" />

### The steps

Under **Steps**, every step has a card with its status, for example "fired" for the trigger, "completed", "not reached" or "needs review". Below it is one row for each message the step handled. A row shows:

- The status, the mailbox, and the number of attempts when there was more than one.
- The subject and sender of the message.
- For **If** and **Branch** steps, the path the message took. Branch rows also show how sure the AI model was.
- Any error, and when the step ran and how long it took.

A **Wait for all** step shows a row named "Barrier" that shows each input's state.

Details from mailboxes you cannot see are left out, and addresses you cannot see read "[hidden address]". If a run does not exist or you cannot see it, the page says "This run does not exist or is not visible to you."

While a run is still going, the page updates on its own.

## Automatic retries

When a run fails for a reason that may pass, such as a mail server that does not answer, Metis Suite tries it again on its own a few times, with a growing wait between tries. Each new try shows as "attempt" and a number, for example "attempt 2". If it still does not succeed, the run ends as **failed**, **partial** or **blocked**, and you can retry it yourself.
