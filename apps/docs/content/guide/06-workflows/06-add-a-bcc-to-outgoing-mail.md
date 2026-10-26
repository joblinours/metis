---
title: Add a BCC to outgoing mail
description: Build a workflow that copies the mail you send to another address, such as an archive.
---

A workflow that starts with **Before a message is sent** runs each time someone in the workspace sends a message from the mail app, just before it goes out. With an **Auto-BCC** step, it adds an address as a blind copy (BCC). The people you write to do not see a BCC address.

Use this to keep a copy of your sent mail in an archive mailbox, or to copy a team address on everything you send.

## Build the workflow

1. Click **Workflows** in the left rail.
2. Click **New workflow** and pick any template, such as **One mailbox, on arrival**. Then remove its steps until the canvas is empty. Point at each card and click **Remove step** (the **X**), or select all the cards with Shift and click, then press Delete.
3. From the **Triggers** category of the step palette, click or drag **Before a message is sent** onto the canvas. You can also press **w** then **a** and search for it.
4. With the trigger selected, choose in the Inspector under **Applies to mail sent from**: **Any mailbox**, or one mailbox so the copy is only added to mail sent from that address.
5. From the **Actions** category of the step palette, add **Auto-BCC**.
6. With **Auto-BCC** selected, enter the address to copy under **Bcc address** in the Inspector, for example `archive@example.com`.

   <img src="/images/workflows/bcc-steps.png" alt="The Before a message is sent and Auto-BCC cards on the canvas before they are connected, with Auto-BCC showing This step is not connected to a trigger" class="dark:hidden" />
   <img src="/images/workflows/bcc-steps-dark.png" alt="The Before a message is sent and Auto-BCC cards on the canvas before they are connected, with Auto-BCC showing This step is not connected to a trigger" class="hidden dark:block" />

   Until you connect them, the **Auto-BCC** card shows "This step is not connected to a trigger".

7. Drag from the "Outgoing mail" output on the right of **Before a message is sent** to the "Outgoing mail" input on the left of **Auto-BCC**.
8. Name the workflow in the top bar, check that the switch says **Enabled**, and click **Create workflow**.

From now on, every message anyone in the workspace sends from the chosen mailboxes in the mail app, including scheduled messages, gets the extra BCC address. Mail sent by the AI assistant or a connected AI client does not.

## Copy only some messages

To add the BCC only to some messages, put an **If** step between the trigger and **Auto-BCC**:

1. Add an **If** step.
2. Remove the connection from the trigger to **Auto-BCC**: click the line and press Delete.
3. Connect the trigger to **If**, set a condition, for example **Recipient** **ends with** `@example.com`, then connect the **Yes** output of **If** to **Auto-BCC**.

The conditions check the message you are sending. See [Steps](/guide/workflows/steps#if) for the fields you can test.

## Good to know

- **Only mail sent from the mail app.** Messages sent from the chosen mailboxes in the mail app get the BCC, including scheduled messages. Mail sent by the AI assistant or a connected AI client does not.
- **An address is never added twice.** If the address is already on the message as a recipient, Cc or BCC, it is not added again.
- **Only If and Auto-BCC work here.** A **Before a message is sent** trigger cannot feed **Mailbox**, **Ask** or any other action. If you connect one, the step shows a problem, and the workflow cannot be saved.
- **It follows the creator's access.** A workflow adds its address only to mail sent from mailboxes its creator can reach in the workspace.
- **Several workflows can add addresses.** If more than one enabled workflow applies to a message, each one adds its address.
- **No runs in the history.** These workflows run as part of sending, so they do not appear under **Activity**.
- **Turned off means no copy.** A disabled workflow adds nothing.
