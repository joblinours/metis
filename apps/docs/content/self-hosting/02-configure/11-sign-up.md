---
title: Sign-up
description: Choose between invite-only accounts and open sign-up for anyone who can reach your instance.
---

A new instance is invite-only. After the first account, people join only when someone who already uses the instance invites them. You can open sign-up instead, so anyone who can reach your instance can create an account.

| Mode                  | What people see on the sign-in page                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Invite only (default) | A note: "Accounts are by invitation only. Ask someone who already uses this instance to invite you." |
| Open sign-up          | Two tabs: **Sign in** and **Create account**.                                                        |

Every account needs two-factor authentication in both modes.

## Change the mode

1. Open **Dashboard**, **System**, **Instance**.
2. In the **Sign-up** card, turn **Invite only** on or off. When it is on, accounts are created only through invites, never through open sign-up with an email and password.
3. Click **Save changes** and enter your authenticator code.

The **Sign-up** card's badge shows **Invite only** or **Open**. On the System page, the **Instance** card shows **Invite only** or **Open sign-up** once the first account exists.

To set the starting mode before the first start, use `METIS_SIGNUP_DISABLED`: `true` (the default) for invite only, `false` for open sign-up.

## Invitations

Any signed-in user can invite people from their account settings. See [Account](/guide/account). Invitations are sent by email, so set up [outgoing email](/self-hosting/configure/outgoing-email) first.

The **People** page of the dashboard counts the invitations that are still pending. It does not let you change or remove accounts.
