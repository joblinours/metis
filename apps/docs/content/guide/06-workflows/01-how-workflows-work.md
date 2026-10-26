---
title: How workflows work
description: What a workflow is made of, when it runs, who it runs as and what it can do.
---

A workflow automates work you would otherwise do by hand in your inbox, such as archiving, starring or labelling mail. This page explains the ideas behind workflows. To build one straight away, follow [Build your first workflow](/guide/workflows/build-your-first-workflow).

## Where to find workflows

Click **Workflows** in the left rail. The Workflows page has a sidebar and an editor.

The **sidebar** on the left lists every workflow you can see. An enabled workflow has a coloured icon. A disabled one has a grey icon and the word "off" after its name. At the top are the back arrow (**Back to mail**) and the **New workflow** menu. At the bottom is the **Activity** link, which opens the history of every run.

The **editor** shows the workflow you picked. It has five parts:

- **The top bar** holds the workflow's name, the **Enabled** switch, the save status and the buttons **Test**, **Run now** and **Save**.
- **The step palette** on the left lists every step you can add.
- **The canvas** in the middle shows the workflow as connected steps. This is where you build and change it.
- **The Inspector** on the right shows the settings of the step you select.
- **The Runs dock** under the canvas has two tabs, **Runs** and **Test run**. It starts closed. Click **Expand** at its right end to open it, and **Collapse** to close it again.

<img src="/images/workflows/workflows-page.png" alt="The Workflows page with the list of workflows, the step palette, a workflow on the canvas and the Inspector" class="dark:hidden" />
<img src="/images/workflows/workflows-page-dark.png" alt="The Workflows page with the list of workflows, the step palette, a workflow on the canvas and the Inspector" class="hidden dark:block" />

You can drag the edges of the palette, the Inspector and the Runs dock to resize them. Use **Hide steps** and **Hide the inspector** in the top bar to make more room for the canvas. The browser remembers these sizes.

The page opens the first workflow in the list. If you have none, it opens the **One mailbox, on arrival** template, not yet saved.

You need at least one mailbox in the workspace to use workflows.

On a phone, the sidebar opens as a drawer named **Workflows**, and there is no palette. Tap **Add step** (the **+** button) in the top bar to add a step. Tap a step to open its settings at the bottom of the screen.

## A workflow is a chain of steps

Each box on the canvas is a **step**. Lines between steps are **connections**. Mail flows along the connections from one step to the next. The palette groups the steps into five categories:

| Category     | What it does                                                     | Examples                                 |
| ------------ | ---------------------------------------------------------------- | ---------------------------------------- |
| **Triggers** | Decide when the workflow runs. Every workflow starts with one.   | **When mail arrives**, **On a schedule** |
| **Mail**     | Picks up the mail the workflow works on.                         | **Mailbox**                              |
| **Logic**    | Filters mail or joins branches back together.                    | **If**, **Combine**, **Wait for all**    |
| **AI**       | Asks an AI model about each message and routes it by the answer. | **Ask**, **Branch**                      |
| **Actions**  | Do something to each message that reaches them.                  | **Archive**, **Star**, **Apply label**   |

A typical workflow reads from left to right: a trigger, then a **Mailbox** step that supplies the mail, then an **If** step that keeps only the messages you care about, then an action. The [Steps](/guide/workflows/steps) page describes every step.

A step with more than one output, such as **If**, shows a label on each connection (for example **Yes** and **No**), so you can see which way mail goes.

## When a workflow runs

The trigger decides when a workflow runs. There are four triggers:

- **When mail arrives** runs shortly after new mail lands in one mailbox.
- **On a schedule** runs at the times you set, for example every weekday at 9:00.
- **When run manually** runs only when you press **Run now**.
- **Before a message is sent** runs each time you send mail, so it can add a BCC address.

See [Triggers](/guide/workflows/triggers) for the details of each one.

Runs happen in the background on your server. You do not need to keep Metis Suite open. Each run is recorded, and you can see what every step did under **Activity**. See [Run a workflow and check its history](/guide/workflows/run-and-check-history).

## Who a workflow runs as

A workflow runs as the person who created it. It can only reach mailboxes that person can reach in the workspace. Run details show this person under **Runs as**. Editing a workflow does not change who it runs as.

If the person who created a workflow leaves the workspace, the workflow can no longer run. Its runs are blocked, and the run details say why.

## Who can see and change workflows

Workflows belong to a workspace, and every member of the workspace can use them:

- You see the workflows you created, plus every workflow that only uses mailboxes you can see.
- Any member can create, edit, turn on, turn off and run workflows they can see.
- Only workspace owners and admins can delete a workflow.

Run history follows the same rule. You see runs of workflows that run as you, and runs that only touch mailboxes you can see. Details from a mailbox you cannot see are hidden, and addresses you cannot see read "[hidden address]".

## Every save keeps a version

Each time you save a workflow, Metis Suite keeps that version as a new **revision**. Each run records the revision it used, so the history always shows the workflow as it was when it ran, even after you change it.

## Workflows do not stop to ask you

A workflow never pauses to wait for your approval. Once it is enabled, it acts on every message that matches. Try a new workflow with **Test** first, which changes nothing, and start with a narrow condition. Then check its runs under **Activity**. See [Run a workflow and check its history](/guide/workflows/run-and-check-history#test-a-workflow-without-changing-anything).

The **Ask** and **Branch** steps let an AI model make a decision inside a workflow, but that is the model answering questions about each message, not a person approving it. See [Let AI decide with Ask and Branch](/guide/workflows/ask-and-branch).

Approval does come in when you ask the Workspace Assistant to change your workflows. See [Manage workflows](/guide/workflows/manage-workflows#change-workflows-from-the-assistant).

## Other features that run in the background

**Schedule send** and **Snooze** in the mail app also run in the background on your server. They are not listed on the Workflows page, and their runs do not appear under **Activity**. You manage them from your mailbox. See [Mail](/guide/mail).
