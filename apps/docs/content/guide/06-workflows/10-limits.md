---
title: Limits
description: The sizes, rules and save messages every workflow has to fit.
---

This page lists the limits a workflow has to fit, and the messages you see when saving finds a problem.

## Sizes

| Item                                             | Limit                                             |
| ------------------------------------------------ | ------------------------------------------------- |
| Workflow name                                    | 80 characters                                     |
| Steps in one workflow                            | 100                                               |
| Connections in one workflow                      | 200                                               |
| Conditions in one workflow                       | 25                                                |
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
| Runs shown under **Activity**                    | The latest 100                                    |
| Retrying a run                                   | Up to 7 days after it finished                    |

## Rules for connections

- Every workflow starts with a trigger, and every other step has to be connected to one.
- A trigger cannot receive a connection.
- A step cannot connect to itself, and steps cannot loop back on themselves.
- Each ordinary step takes one incoming connection. Use **Combine** or **Wait for all** to join branches.
- Each branch needs its own input on a **Combine** or **Wait for all** step, and those inputs carry mail only.
- Only an **If** step has **Yes** and **No** outputs.
- An **Ask** step's outputs connect only to **Branch** steps, and a **Branch** step only takes input from an **Ask** step.
- A **Mailbox** step set to **newly arrived mail** works only under a **When mail arrives** trigger.
- **Ask** and **Branch** cannot be used after **Before a message is sent**.

## Fields that must be filled in

Every condition value, question, answer and BCC address has to be filled in. A **BCC address** also has to be a valid email address. A workflow with an empty one cannot be saved.

## Messages when you save

When you click **Save** or **Create workflow**, Metis Suite checks the whole workflow first. If something is wrong, the first problem appears in red at the top right, and nothing is saved.

| Message                                                                                                                        | What to do                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| "Give your workflow a name"                                                                                                    | Type a name in the field at the top left.                                                        |
| "Start the workflow with a trigger"                                                                                            | Add a trigger from **Add step**.                                                                 |
| "This step is not connected to a trigger"                                                                                      | Connect the step, or remove it.                                                                  |
| "Connect this step to a trigger"                                                                                               | Connect a trigger to this **Mailbox** step.                                                      |
| "Connect this trigger to exactly one mailbox step that provides incoming mail"                                                 | Connect the **When mail arrives** trigger to one **Mailbox** step set to **newly arrived mail**. |
| "Connect this step to a mailbox that provides mail" or "Connect this If step to a mailbox that provides mail"                  | Put a **Mailbox** step above this step.                                                          |
| "Connect this step to a message being sent"                                                                                    | Connect this **Auto-BCC** step under a **Before a message is sent** trigger.                     |
| "A mailbox set to newly arrived mail only runs under a new-mail trigger. Pick a folder or search instead."                     | Change **Provides** to **a folder or search**, or use a **When mail arrives** trigger.           |
| "That mailbox is not available in this workspace"                                                                              | Pick another mailbox in the **Mailbox** step.                                                    |
| "This step receives more than one connection. Give it a single input, or add a Combine or Wait for all step to join branches." | Remove a connection, or add a **Combine** or **Wait for all** step.                              |
| "Two branches share one Combine input. Give each its own."                                                                     | Connect each branch to its own dot on top of the step. Point at a dot to see its number.         |
| "Connect an If step from its Yes or No output"                                                                                 | Connect from **Yes** or **No**.                                                                  |
| "Use a five-field cron expression, for example 0 9 * * 1-5"                                                                    | Fix the **Cron (5 fields)** value. See [Triggers](/guide/workflows/triggers#on-a-schedule).      |
| A time zone "is not a known time zone"                                                                                         | Enter a time zone name such as `Europe/Berlin`.                                                  |
| "Every condition group needs at least one condition"                                                                           | Add a condition to the empty group, or remove the group.                                         |
| "Maximum 25 conditions per workflow"                                                                                           | Remove some conditions.                                                                          |
| "Add a question to this Ask step"                                                                                              | Add at least one question.                                                                       |
| "Set the No threshold below the Yes threshold"                                                                                 | On the **Branch** step, move **No when at most** below **Yes when at least**.                    |
| "Turn AI on for every mailbox that feeds this Ask step"                                                                        | Turn AI on for those mailboxes, or feed the Ask step from another mailbox.                       |
| "Ask and Branch steps are turned off on this instance"                                                                         | Remove the Ask and Branch steps, or ask your administrator.                                      |
| "Ask and Branch steps cannot run before a message is sent"                                                                     | Use Ask and Branch with another trigger.                                                         |
| "A workflow can hold at most 100 steps"                                                                                        | Split the workflow into two.                                                                     |
| "A workflow can hold at most 200 connections"                                                                                  | Split the workflow into two.                                                                     |

## Other limits

- **A workflow never asks before it acts.** There is no approval step inside a workflow.
- **Workflows work on mail only.** There are no steps for calendars or drives.
- **There is no step that sends or replies to mail.**
- **New mail is not instant.** A **When mail arrives** workflow runs shortly after the mail lands, not at the same moment.
- **Mail already in a mailbox is skipped** when a **When mail arrives** trigger starts watching it.
- **A workflow can only reach the mailboxes of the person who created it.**
