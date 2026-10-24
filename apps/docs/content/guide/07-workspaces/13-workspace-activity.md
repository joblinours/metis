---
title: Workspace activity
description: See who changed roles, removed members, sent or revoked invites, or detached mailboxes, calendars and drives in a workspace.
---

The **Activity** page of a workspace lists security-relevant changes made in it: who changed what, and when. Only the workspace's owner and admins can see it.

This page is part of the workspace's settings. It is not the **Activity** page of **Workflows**, which shows workflow runs.

## Open the Activity page

1. Open the workspace menu at the top of the left rail and choose **General**.
2. In the list on the left, click **Activity**. It is the last item, below **Drives**.

Members do not see **Activity** in the list. If a member opens the page's address, the page says "Only workspace owners and admins can see activity."

The page says "Role changes, ownership transfers, removed members, invites and detached mailboxes, calendars and drives in this workspace." If nothing has been recorded yet, it says "Nothing has happened in this workspace yet."

## What it lists

| Row title                                                       | Recorded when                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Member role changed**                                         | The owner changes a member's role. The row shows the old and new role, for example "member → admin".                                                                                                                                                            |
| **Member removed**                                              | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                                                             |
| **Ownership transferred**                                       | The owner makes another member the owner.                                                                                                                                                                                                                       |
| **Workspace invite sent**                                       | An owner or admin invites someone. The row shows the role, "as admin" or "as member".                                                                                                                                                                           |
| **Workspace invite revoked**                                    | An owner or admin cancels a pending invite.                                                                                                                                                                                                                     |
| **Mailbox detached**, **Calendar detached**, **Drive detached** | Someone takes a mailbox, calendar or drive out of this workspace. This can happen on the workspace's **Mailboxes**, **Calendars** or **Drives** page, with **Detach from this workspace** in search, or in the account settings of the person who connected it. |

Each change is recorded after it succeeds. Some changes that affect the workspace are not listed here:

- A mailbox, calendar or drive that its owner deletes from their account settings.
- An account that its owner disconnects.
- Deleting the workspace itself.

The person who made one of these changes sees it in their own [Security activity](/guide/account/security-activity).

## What each row shows

- **What happened**, such as **Member removed**.
- **A badge** if the change came from an AI tool: **Workspace Assistant** or **MCP client**.
- **What it was about**, such as the member's or the invited person's email address.
- **Who made the change**: "by" and their email address.
- **When** it happened (date and time).

This page does not show IP addresses or devices.

The newest change is at the top. The page shows 50 rows at a time. Click **Load more** to see older ones. You cannot filter, search, edit or delete rows. The person who runs your Metis Suite server decides how long rows are kept.

To see the changes you made yourself across all your workspaces, open your [Security activity](/guide/account/security-activity).
