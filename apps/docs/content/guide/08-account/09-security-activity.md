---
title: Security activity
description: See the security-relevant changes you made, and the changes other people made to your place in a workspace.
---

The **Security activity** card lists security-relevant changes that involve you. Check it to make sure every change is one you expected.

It shows two kinds of change:

- **Changes you made.** For example, you turned off two-factor authentication, approved an MCP client, removed a member or sent an invite.
- **Changes other people made to you.** Someone changed your role in a workspace, removed you from a workspace, made you the owner of a workspace, or detached your mailbox, calendar or drive from a workspace.

Metis Suite records only the changes in the [list below](#what-is-recorded). Each one is recorded after it succeeds. Signing in and everyday use, such as reading mail or opening files, are not recorded. The content of your mail, events and files is never recorded.

To find out each time someone signs in to your account, use [sign-in alerts](/guide/account/sign-in-alerts) instead. They send you an email for every sign-in.

## Open Security activity

1. Open your user menu (the round button with your initials at the bottom of the left rail) and click **Settings**.
2. Click **Security**.
3. Scroll down to the **Security activity** card. It is below **Disable two-factor authentication** and above **Delete account**.

The card says "Security-relevant changes you made, and changes other people made to your membership. Your server’s operator decides how long these are kept." If nothing has been recorded yet, it says "No security activity yet."

## What each row shows

Each row is one change:

- **What happened**, such as **Member role changed** or **Workspace invite sent**.
- **A badge** if the change came from an AI tool: **Workspace Assistant** when the assistant made it for you, or **MCP client** when an outside AI app made it. A change you made yourself in the app has no badge.
- **What it was about**, such as an email address or a client's name. Some rows add more:
  - a role change shows the old and new role, for example "member → admin";
  - a workspace invite shows the role, "as admin" or "as member";
  - an MCP client row lists the sensitive tools that were turned on;
  - a removed mailbox, calendar or drive says "access revoked at the provider" when Metis Suite also took back its access at the provider.
- **Who made the change**: "by" and their email address. If the account no longer exists and its address is unknown, the row says "by a deleted account".
- **The workspace**, when the change happened in one. Changes in a workspace that was deleted later still show its name.
- **When** it happened (date and time).
- **Where it came from**: the network address (IP address) and the device, such as "Chrome 130 on Windows", when Metis Suite knows them.

The newest change is at the top. The card shows 50 rows at a time. Click **Load more** to see older ones. You cannot filter, search, edit or delete rows.

## What is recorded

| Row title                                                       | Recorded when                                                                                                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Account deleted**                                             | Someone deletes their Metis Suite account. Only the owner of your Metis Suite server sees this row. See [Delete your account](/guide/account/delete-your-account).                                                          |
| **Two-factor authentication disabled**                          | Someone clicks **Disable 2FA** and confirms. See [Two-factor authentication](/guide/account/two-factor-authentication#turn-two-factor-authentication-off-and-on-again).                                                     |
| **Sign-in alerts turned off**                                   | Someone turns off the **Sign-in alerts** switch. Turning it back on is not recorded. See [Sign-in alerts](/guide/account/sign-in-alerts#turn-sign-in-alerts-off-or-on).                                                     |
| **MCP client added**                                            | Someone adds an MCP client by hand under **Settings**, **MCP clients**.                                                                                                                                                     |
| **MCP client approved**                                         | Someone approves an AI app's request to connect.                                                                                                                                                                            |
| **MCP client re-enabled**                                       | Someone turns a client that was off back on.                                                                                                                                                                                |
| **Sensitive MCP tools turned on**                               | Someone turns on one or more sensitive tools for a client. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).                                                                                                   |
| **Account disconnected**                                        | Someone disconnects a connected account.                                                                                                                                                                                    |
| **Mailbox removed**, **Calendar removed**, **Drive removed**    | Someone deletes a mailbox, calendar or drive from their account settings. See [Manage your connected accounts](/guide/workspaces/manage-connected-accounts).                                                                |
| **Mailbox detached**, **Calendar detached**, **Drive detached** | Someone takes a mailbox, calendar or drive out of one workspace. This can happen in account settings, on the workspace's **Mailboxes**, **Calendars** or **Drives** page, or with **Detach from this workspace** in search. |
| **Member role changed**                                         | The owner changes a member's role.                                                                                                                                                                                          |
| **Member removed**                                              | An owner or admin removes a member, or an admin removes themselves.                                                                                                                                                         |
| **Ownership transferred**                                       | The owner makes another member the owner.                                                                                                                                                                                   |
| **Workspace deleted**                                           | The owner deletes a workspace.                                                                                                                                                                                              |
| **Workspace invite sent**, **Workspace invite revoked**         | An owner or admin invites someone to a workspace, or cancels a pending invite. See [Members and roles](/guide/workspaces/members-and-roles).                                                                                |
| **Sign-up invite sent**, **Sign-up invite revoked**             | Someone invites a person to create an account, or revokes that invite. See [Invite people to Metis Suite](/guide/account/invite-people).                                                                                    |

You see a row only if you made the change or it was made to you.

## Who else can see these changes

- **Workspace owners and admins** see the changes made in their workspace on its **Activity** page, without IP addresses or devices. See [Workspace activity](/guide/workspaces/workspace-activity).
- **The owner of your Metis Suite server** sees every recorded change by every user, with IP addresses and devices.

## How long rows are kept

The person who runs your Metis Suite server decides how long rows are kept. Older rows are deleted after that time.

To keep your own copy, [export your data](/guide/account/export-your-data). The file holds every row of your security activity.

## If you see a change you did not make

Act quickly:

- Sign out every browser you do not recognize. See [Manage signed-in devices](/guide/account/signed-in-devices).
- Change your password. See [Change or reset your password](/guide/account/change-or-reset-your-password).
- Check your MCP clients, and turn off or remove any you do not know. See [Manage MCP clients](/guide/assistant/manage-mcp-clients).
- If the change happened in a workspace, tell its owner or an admin.

A [sign-in alert](/guide/account/sign-in-alerts) can warn you sooner. If you get one for a sign-in you did not make, follow the same steps. If you see **Sign-in alerts turned off** and you did not turn them off, turn them back on.
