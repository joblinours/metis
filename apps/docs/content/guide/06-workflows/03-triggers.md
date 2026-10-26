---
title: Triggers
description: The four ways a workflow can start, and how to set a schedule and its time zone.
---

A trigger decides when a workflow runs. Every workflow starts with at least one trigger, and a trigger never has a connection coming into it. Add a trigger from the **Triggers** category of the step palette, or press **w** then **a** and search for it. Click a trigger on the canvas to see its settings in the Inspector.

| Trigger                      | Runs                                        | Feeds into                                         |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------- |
| **When mail arrives**        | Shortly after new mail lands in one mailbox | One **Mailbox** step set to **Newly arrived mail** |
| **On a schedule**            | At the times you set                        | **Mailbox** steps set to **A folder or search**    |
| **When run manually**        | Only when you press **Run now**             | **Mailbox** steps set to **A folder or search**    |
| **Before a message is sent** | Each time you send a message                | **If** and **Auto-BCC** steps only                 |

A workflow can have more than one trigger. For example, to watch two mailboxes for new mail, add one **When mail arrives** trigger for each.

## When mail arrives

This trigger watches one mailbox for new mail. Connect it to a **Mailbox** step and set that step's **Provides** to **Newly arrived mail**. To watch a second mailbox, add a second trigger.

Before it is connected, the card says "Connect a Mailbox step". The Inspector says "Connect this trigger to one Mailbox step set to newly arrived mail. Add another trigger to watch another mailbox." Once it is connected, the card says "Watching" followed by the mailbox address.

<img src="/images/workflows/new-mail-trigger.png" alt="A When mail arrives card watching a mailbox address" class="dark:hidden" />
<img src="/images/workflows/new-mail-trigger-dark.png" alt="A When mail arrives card watching a mailbox address" class="hidden dark:block" />

Click the trigger to see how the watch is going. Under the address, the Inspector shows one status line:

| Status                                              | Meaning                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Starts watching once you save."                    | The workflow is not saved yet, or you just connected a different mailbox.         |
| "Taking a baseline: mail already there is skipped." | Metis Suite is noting the mail already in the mailbox. That mail is skipped.      |
| "Waiting for the first check."                      | The baseline is done, and the mailbox has not been checked for new mail yet.      |
| **Checked** and a date and time                     | The last time the mailbox was checked for new mail.                               |
| "Last check failed:" and a reason                   | The last check did not work. The line shows the reason.                           |
| "Paused: mail is not being watched."                | The mailbox is not being watched, for example because the workflow is turned off. |

Mail that is already in the mailbox when you turn the workflow on is never processed. Only mail that arrives afterwards goes through the workflow. Turning a workflow off and on again takes a fresh baseline, so mail that arrived while it was off is skipped too.

You cannot use **Run now** with a workflow whose only trigger is **When mail arrives**. You can still try it with **Test**, which runs it on one of the newest messages in the mailbox. See [Test a workflow without changing anything](/guide/workflows/run-and-check-history#test-a-workflow-without-changing-anything).

## On a schedule

This trigger runs the workflow at set times. A new schedule runs every weekday at 09:00, in your browser's time zone. Click the trigger to change it in the Inspector.

<img src="/images/workflows/schedule-trigger.png" alt="The Inspector for an On a schedule trigger set to Every day at 07:00, with its time zone and next runs" class="dark:hidden" />
<img src="/images/workflows/schedule-trigger-dark.png" alt="The Inspector for an On a schedule trigger set to Every day at 07:00, with its time zone and next runs" class="hidden dark:block" />

Pick how often it runs under **Repeats**. Each choice shows the fields it needs:

| Repeats           | Fields                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Every hour**    | **Minutes past the hour**, from 0 to 59                                                                    |
| **Every day**     | **At**: the time of day                                                                                    |
| **Every weekday** | **At**: the time of day, Monday to Friday                                                                  |
| **Every week**    | **On**: the day of the week, and **At**: the time of day                                                   |
| **Every month**   | **On day**: the day of the month, from 1 to 31, and **At**: the time of day                                |
| **Custom (cron)** | **Cron expression**: any schedule written as a cron expression. See [Custom schedules](#custom-schedules). |

With **Every month**, a day after the 28th shows a note such as "Months without day 31 are skipped." In those months, the workflow does not run.

Under **Time zone**, pick the time zone the times are in. Type part of a name, such as `Berlin` or `New_York`, to search the list.

**Next runs** shows the next three times the workflow will run, so you can check the schedule before you save. If the schedule can never run, it says "This schedule never fires as written."

The card on the canvas sums up the schedule, for example "Weekdays at 09:00" or "Every hour at :15", with the time zone below it.

### Custom schedules

Choose **Custom (cron)** under **Repeats** to write the schedule as a cron expression. A cron expression is five values separated by spaces. In order, they are the minute, the hour, the day of the month, the month, and the day of the week. A `*` means "every". Days of the week run from `0` (Sunday) to `6` (Saturday).

| Cron           | Runs                                 |
| -------------- | ------------------------------------ |
| `0 9 * * 1-5`  | 9:00 every Monday to Friday          |
| `0 7 * * *`    | 7:00 every day                       |
| `30 17 * * 5`  | 17:30 every Friday                   |
| `0 8,13 * * *` | 8:00 and 13:00 every day             |
| `*/30 * * * *` | Every 30 minutes                     |
| `0 6 1 * *`    | 6:00 on the first day of every month |

A custom schedule that matches none of the other choices shows the cron expression itself on the card. If the expression is not a valid five-field cron expression, the step shows "Use a five-field cron expression, for example 0 9 * * 1-5" straight away, and the workflow cannot be saved until you fix it.

### When scheduled runs happen

A run can start a little after the scheduled minute. If your server was down when one or more scheduled times passed, the workflow runs once when the server is back, not once for every missed time. The run details then say how many missed times were combined.

A schedule trigger feeds **Mailbox** steps set to **A folder or search**, such as the 20 newest messages in your inbox. **Run now** also works with a scheduled workflow, so you can run it without waiting.

## When run manually

This trigger has no settings. Its card has no summary line, and the Inspector says "Starts the workflow when you press Run now." Use it for clean-up jobs you want to start yourself, or to try a workflow before you put it on a schedule.

Like a schedule, it feeds **Mailbox** steps set to **A folder or search**. See [Run a workflow and check its history](/guide/workflows/run-and-check-history).

## Before a message is sent

This trigger runs each time anyone in the workspace sends a message from the mail app, just before it goes out. This includes scheduled messages. Mail sent by the AI assistant or a connected AI client does not trigger it. Its only field is **Applies to mail sent from**: choose **Any mailbox**, or one mailbox so it only runs for mail sent from that address. The card says "Sent from any mailbox" or "Sent from" and the address.

It can only feed **If** and **Auto-BCC** steps. Use it to add a BCC address to outgoing mail. See [Add a BCC to outgoing mail](/guide/workflows/add-a-bcc-to-outgoing-mail).

These checks happen as part of sending, so they do not appear under **Activity**.
