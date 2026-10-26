---
title: Limits
description: The sizes, rules and problem messages every workflow has to fit.
---

This page lists the limits a workflow has to fit, and the problem messages the editor shows.

## Sizes

| Item                                             | Limit                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| Workflow name                                    | 80 characters                                     |
| Step name                                        | 60 characters                                     |
| Steps in one workflow                            | 100                                               |
| Connections in one workflow                      | 200                                               |
| Conditions in one **If** step                    | 25                                                |
| Groups inside groups in an **If** step           | 3 levels                                          |
| Condition value                                  | 200 characters                                    |
| **Mailbox** search                               | 200 characters                                    |
| **Mailbox** "Take at most"                       | 1 to 100 messages (default 50)                    |
| Inputs on a **Combine** or **Wait for all** step | 16                                                |
| **Ask** question text                            | 500 characters                                    |
| **Pick one** answer name                         | 40 characters                                     |
| **Pick one** "When it applies" note              | 200 characters                                    |
| Message body sent to the model by **Ask**        | The first 8,000 characters                        |
| **Try on recent mail**                           | 10 newest inbox messages, up to 10 tries a minute |
| Test runs                                        | Up to 10 a minute                                 |
| Messages to pick from in a test run              | The 25 newest inbox messages                      |
| Runs in the editor's **Runs** tab                | The latest 20                                     |
| Undo                                             | The last 100 changes                              |
| Runs shown under **Activity**                    | The latest 100                                    |
| Retrying a run                                   | Up to 7 days after it finished                    |

## Rules for connections

- Every workflow starts with a trigger, and every other step has to be connected to one.
- A trigger cannot receive a connection.
- A step cannot connect to itself, and steps cannot loop back on themselves.
- Each ordinary step takes one incoming connection. Use **Combine** or **Wait for all** to join branches.
- Each branch needs its own input on a **Combine** or **Wait for all** step, and those inputs carry mail only.
- An **Ask** step's outputs connect only to **Branch** steps, and a **Branch** step only takes input from an **Ask** step.
- A **Mailbox** step set to **Newly arrived mail** works only under a **When mail arrives** trigger.
- **Ask** and **Branch** cannot be used after **Before a message is sent**.

## Fields that must be filled in

Every condition value, question, answer, level and Bcc address has to be filled in, and a **Bcc address** has to be a valid email address.

The editor flags an empty condition value straight away, with "Fill in the value of every condition". An empty Bcc address shows "No address yet" on the card. An empty question, answer or level, or a Bcc address that is empty or not valid, is not flagged as you edit. The workflow is refused when you save, with a message from the server.

## Problem messages

The editor checks the workflow after every change. A problem shows in red at the bottom of the step's card and in the Inspector, and the top bar shows a red button such as **1 problem**. Click the button to select the first step with a problem. Problems that belong to the whole workflow, such as a missing trigger, show at the top of the Inspector.

A workflow with problems cannot be saved. When you click **Save** or **Create workflow**, you see "Fix the problem in this workflow before saving" or "Fix the 2 problems in this workflow before saving", and the first step with a problem is selected. A workflow without a name shows "Give your workflow a name".

| Message                                                                                                                        | What to do                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Give your workflow a name"                                                                                                    | Type a name in the field in the top bar.                                                                                           |
| "Start the workflow with a trigger"                                                                                            | Add a trigger from the **Triggers** category of the step palette.                                                                  |
| "This step is not connected to a trigger"                                                                                      | Connect the step, or remove it.                                                                                                    |
| "A trigger cannot receive a connection"                                                                                        | Remove the connection that goes into the trigger.                                                                                  |
| "Workflow steps cannot loop back on themselves"                                                                                | Remove a connection so that mail never comes back to a step it already passed.                                                     |
| "Connect this step to a trigger"                                                                                               | Connect a trigger to this **Mailbox** step.                                                                                        |
| "Connect this trigger to exactly one mailbox step that provides incoming mail"                                                 | Connect the **When mail arrives** trigger to one **Mailbox** step set to **Newly arrived mail**.                                   |
| "A mailbox fed by the new-mail trigger must provide incoming mail"                                                             | Set the **Mailbox** step's **Provides** to **Newly arrived mail**.                                                                 |
| "Connect this step to a mailbox that provides mail" or "Connect this If step to a mailbox that provides mail"                  | Connect a **Mailbox** step before this step.                                                                                       |
| "Connect this step to a message being sent"                                                                                    | Connect this **Auto-BCC** step after a **Before a message is sent** trigger.                                                       |
| "A mailbox set to newly arrived mail only runs under a new-mail trigger. Pick a folder or search instead."                     | Change **Provides** to **A folder or search**, or use a **When mail arrives** trigger.                                             |
| "That mailbox is not available in this workspace"                                                                              | Pick another mailbox in the **Mailbox** step.                                                                                      |
| "This step receives more than one connection. Give it a single input, or add a Combine or Wait for all step to join branches." | Remove a connection, or add a **Combine** or **Wait for all** step.                                                                |
| "Two branches share one Combine input. Give each its own." (or "one Wait for all input")                                       | Connect each branch to its own numbered input, such as "Mail 1" and "Mail 2".                                                      |
| "Fill in the value of every condition"                                                                                         | Type a value in each condition of the **If** step.                                                                                 |
| "Every condition group needs at least one condition"                                                                           | Add a condition to the empty group, or remove the group.                                                                           |
| "Maximum 25 conditions per workflow"                                                                                           | Remove some conditions from this **If** step.                                                                                      |
| "Use a five-field cron expression, for example 0 9 * * 1-5"                                                                    | Fix the **Cron expression**, or pick another choice under **Repeats**. See [Triggers](/guide/workflows/triggers#custom-schedules). |
| A time zone "is not a known time zone"                                                                                         | Pick a time zone from the **Time zone** list.                                                                                      |
| "Add a question to this Ask step"                                                                                              | Add at least one question.                                                                                                         |
| "A Pick one question can offer at most 255 answers, Other included"                                                            | Remove some answers.                                                                                                               |
| "An Ask step's questions connect only to Branch steps"                                                                         | Connect each question output of the Ask step to a **Branch** step.                                                                 |
| "Connect a Branch step to a question on an Ask step"                                                                           | Connect one of the Ask step's question outputs to this **Branch** step.                                                            |
| "Set the No threshold below the Yes threshold"                                                                                 | In the **Branch** step's Inspector, move **No when at most** below **Yes when at least**.                                          |
| "Turn AI on for every mailbox that feeds this Ask step"                                                                        | Turn AI on for those mailboxes, or feed the Ask step from another mailbox.                                                         |
| "Ask and Branch steps are turned off on this instance"                                                                         | Remove the Ask and Branch steps, or ask your administrator.                                                                        |
| "Ask and Branch steps cannot run before a message is sent"                                                                     | Use Ask and Branch with another trigger.                                                                                           |
| "A workflow can hold at most 100 steps"                                                                                        | Split the workflow into two.                                                                                                       |
| "A workflow can hold at most 200 connections"                                                                                  | Split the workflow into two.                                                                                                       |

A step connected to the wrong kind of data, for example a **Mailbox** step after **Before a message is sent**, also shows a problem that says what it needs.

## Other limits

- **A workflow never asks before it acts.** There is no approval step inside a workflow.
- **Workflows work on mail only.** There are no steps for calendars or drives.
- **There is no step that sends or replies to mail.**
- **New mail is not instant.** A **When mail arrives** workflow runs shortly after the mail lands, not at the same moment.
- **Mail already in a mailbox is skipped** when a **When mail arrives** trigger starts watching it.
- **A workflow can only reach the mailboxes of the person who created it.**
