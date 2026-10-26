---
title: Steps
description: Every step you can add to a workflow, what it does and the fields it has.
---

This page lists every step you can add, grouped the way the step palette groups them: **Triggers**, **Mail**, **Logic**, **AI** and **Actions**. For triggers, see [Triggers](/guide/workflows/triggers).

## Add a step

There are two ways to add a step:

- **From the step palette** on the left of the editor. Click a step to add it in the middle of the canvas, or drag it onto the canvas and drop it where you want it. Type in **Search steps** to filter the list by name, category or description.
- **From the Add step window.** Press **w** then **a** (or tap **Add step** on a phone). Type to search, then press **Enter** to add the highlighted step, or click a step.

<img src="/images/workflows/add-step-menu.png" alt="The Add step window with its search box and steps grouped under Triggers, Mail and Logic" class="dark:hidden" />
<img src="/images/workflows/add-step-menu-dark.png" alt="The Add step window with its search box and steps grouped under Triggers, Mail and Logic" class="hidden dark:block" />

The new step is selected, and its settings open in the Inspector on the right.

## Work with steps on the canvas

Each step shows as a card. The card gives a short summary of the step's settings. To change the settings, click the card and use the Inspector.

- **Move a step:** drag its card. Steps snap to a grid.
- **Connect two steps:** drag from an output on the right side of one card to an input on the left side of the next. Mail flows in that direction. Each input and output has a label, such as "Mail", "Start" or **Yes**.
- **Select several steps:** hold Shift, Ctrl or Cmd and click each one. Click an empty part of the canvas to clear the selection.
- **Remove a step:** point at its card and click **Remove step** (the **X**), or click **Delete** in the Inspector. You can also select steps and press Delete or Backspace.
- **Remove a connection:** click the line and press Delete or Backspace.
- **Copy steps:** select them and press Ctrl + C (Cmd + C on a Mac), then Ctrl + V to paste. The connections between the copied steps come along. You can paste into another workflow too. Ctrl + D, or **Duplicate** in the Inspector, makes a copy in one go.
- **Undo a change:** click **Undo** in the top bar, or press Ctrl + Z. **Redo** brings it back.
- **Move around:** drag the empty canvas to pan. The buttons in the bottom left corner zoom in and out, fit the whole workflow in view (**Fit View**), tidy it (**Tidy up the layout**) and hide or show the small map in the bottom right corner (**Hide the minimap**).

**Tidy up the layout** arranges the steps in columns from left to right and fits them in view. It is also in the **More workflow actions** menu (**...**) in the top bar, and on the keyboard as **w** then **l**. See [Keyboard shortcuts](/guide/reference/keyboard-shortcuts#workflows) for every key.

Every step except a trigger takes exactly one incoming connection. To bring two branches back together, use a **Combine** or **Wait for all** step, which take several. The canvas refuses a connection that can never work, for example a second connection into an ordinary step, or a step connected to itself.

## Problems show as you build

Metis Suite checks the workflow after every change. When a step has a problem, the card shows it in red at the bottom, and the Inspector lists it under "Something needs attention" (or, for several, "2 things need attention"). The top bar shows a red button such as **1 problem** or **3 problems**. Click it to select the first step with a problem.

When no step is selected, the Inspector shows how many steps and connections the workflow has, then either "Ready to save: no problems found." or the list of problems. Click a problem to select its step.

Changes on the canvas are not saved until you click **Save** (or **Create workflow** for a new one), and a workflow with problems cannot be saved. See [Limits](/guide/workflows/limits#problem-messages) for every problem message.

## Settings every step has

Click a step to see its settings in the Inspector. Above the settings for that kind of step, every step has:

- **Name**: a name of your own for the step, up to 60 characters. It shows on the card, with the kind of step in small text under it. Leave it empty to use the step's usual name.
- **Skip this step** (action steps only): turn it on to keep the step in the workflow without running it. "Mail passes straight through without the action." The card shows **Skipped**.

At the bottom are **Duplicate** and **Delete**.

## Mail and Logic steps

### Mailbox

Supplies the mail the rest of the workflow works on. It has these fields:

| Field                 | What it does                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mailbox**           | The mailbox to read. The first mailbox is picked to start with. If the workspace has none, it says "Connect a mailbox to this workspace first." |
| **Provides**          | **Newly arrived mail** (for the **When mail arrives** trigger) or **A folder or search** (for **On a schedule** and **When run manually**).     |
| **Folder**            | With **A folder or search**: one of Inbox, Sent, Drafts, Starred, Trash, Archive or Spam.                                                       |
| **Search (optional)** | With **A folder or search**: a search, for example `from:billing@`. A search replaces the folder. Up to 200 characters.                         |
| **Take at most**      | With **A folder or search**: how many of the newest messages to take, from 1 to 100. The default is 50.                                         |

An **On a schedule** or **When run manually** trigger can feed several **Mailbox** steps, for example one for each of two mailboxes. Each one runs as its own branch. A **When mail arrives** trigger feeds exactly one **Mailbox** step.

### If

Checks each message against one or more conditions. Matching messages leave through the **Yes** output, and the rest leave through **No**. You can connect either output, both or just one.

Each condition has three parts:

- **A field:** **Sender**, **Recipient**, **Cc**, **Subject**, **Body** or **Has attachment**.
- **A comparison:** **contains**, **is**, **starts with** or **ends with**. For **Has attachment**, you pick **Yes** or **No** instead.
- **A value:** the text to look for, up to 200 characters.

Conditions sit in a group that says "Match **all** of these" or "Match **any** of these". Choose **all** when every condition has to be true, and **any** when one is enough. The first group starts on **all**, and a group you add inside it starts on **any**.

- **+ Condition** adds a condition to the group.
- **Group** adds a group inside the group, so you can mix **all** and **any**. For example, "Subject contains invoice, and the sender ends with @example.com or @example.org". Groups can go three levels deep.
- **Remove condition** and **Remove group** (the **X**) take one out. They show only when the group they are in has more than one item.

The card lists up to two conditions, then "and" and the number of others.

### Combine and Wait for all

These steps join two or more branches back into one, so a single action can follow them. They are one step with two modes, chosen in the **Mode** field:

| Mode                          | Step             | What it does                                                                                                                                                                            |
| ----------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pass on each input's mail** | **Combine**      | Passes on mail from every input as soon as it arrives. A message that comes in through more than one input is acted on once.                                                            |
| **Wait for every input**      | **Wait for all** | Holds everything until every input that ran has finished, then passes the mail on. An input that finds no mail counts as finished. If any input fails or is blocked, nothing continues. |

The inputs are on the left of the step, numbered "Mail 1", "Mail 2" and so on. There is always one spare empty input, so you can connect another branch, up to 16. Each branch needs its own input. These steps accept mail only.

The card shows how many inputs are connected, for example "Combines 2 inputs" or "Waits for 2 inputs". The Inspector says the same in more detail, for example "Combines 2 inputs, in input order." Until a branch is connected, it says "Connect the branches to combine."

<img src="/images/workflows/combine-workflow.png" alt="A workflow where two If steps join in a Combine step before Apply label" class="dark:hidden" />
<img src="/images/workflows/combine-workflow-dark.png" alt="A workflow where two If steps join in a Combine step before Apply label" class="hidden dark:block" />

## AI steps

**Ask** and **Branch** let an AI model answer questions about each message, then send the message down a path for each answer. They appear under **AI** in the step palette only if your instance offers them. See [Let AI decide with Ask and Branch](/guide/workflows/ask-and-branch).

## Actions

Actions do something to every message that reaches them. An action is usually the last step of a branch. Every action can be skipped with **Skip this step**.

| Step              | What it does                                                                                                  | Fields                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Mark as read**  | Marks the message as read.                                                                                    | None                                                                                                      |
| **Star**          | Stars the message.                                                                                            | None                                                                                                      |
| **Apply label**   | Gives the message a label.                                                                                    | **Label**: a built-in label or a custom label from any mailbox in the workspace. The default is **Work**. |
| **Mute thread**   | Mutes the conversation the message belongs to.                                                                | None                                                                                                      |
| **Archive**       | Moves the message out of the inbox into the archive.                                                          | None                                                                                                      |
| **Move to Trash** | Moves the message to Trash.                                                                                   | None                                                                                                      |
| **Auto-BCC**      | Adds an address as BCC to a message you are sending. Works only after a **Before a message is sent** trigger. | **Bcc address**                                                                                           |

To find out more about labels and muting, see [Mail](/guide/mail).

## Templates

The **New workflow** menu starts you from a ready-made set of steps, laid out from left to right:

| Template                                  | Steps                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **One mailbox, on arrival**               | **When mail arrives**, a **Mailbox** set to newly arrived mail, an **If**, and **Archive** on **Yes**.             |
| **Two mailboxes, on arrival**             | Two **When mail arrives** triggers, each with its own mailbox. One goes to **Apply label**, the other to **Star**. |
| **Two mailboxes, on a schedule**          | **On a schedule** feeding two **Mailbox** steps. One goes to **Mark as read**, the other to **Apply label**.       |
| **Two mailboxes, one shared action**      | **On a schedule**, two mailboxes, a **Combine** step and **Apply label**.                                          |
| **Two mailboxes, act once both are read** | **On a schedule**, two mailboxes, a **Wait for all** step and **Apply label**.                                     |

If the workspace has only one mailbox, the two-mailbox templates use it for both branches. A template opens with no name and is not saved. In **One mailbox, on arrival**, the **If** step starts with an empty value, so the editor shows **1 problem** until you fill it in. Change any step before you save.

If the workflow you have open has unsaved changes, picking a template first asks "Discard unsaved changes?". See [Manage workflows](/guide/workflows/manage-workflows#unsaved-changes).
