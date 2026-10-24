---
title: Outgoing email
description: Set how your instance sends its own email, such as sign-in links, sign-in alerts, password resets and invitations.
---

Your instance sends some email of its own: sign-in links, [sign-in alerts](/guide/account/sign-in-alerts), email verification, password resets and invitations. This is separate from your users' mail, which always goes through their own mailboxes.

On a new instance, this email is not delivered. It is written to the server log instead, so you can test without a mail service. To deliver it, use Resend or an SMTP server.

## Choose a driver

Open **Dashboard**, **System**, **Mail** under **Drivers**.

| Driver          | What happens                                                                                                                            | Badge on the System page |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `log` (default) | Each email is written to the app's log instead of being sent.                                                                           | **Console only**         |
| `resend`        | Sent through [Resend](https://resend.com) with your API key.                                                                            | **Delivering**           |
| `smtp`          | Sent through your SMTP server.                                                                                                          | **Delivering**           |
| `noop`          | Nothing is sent or logged. Magic link sign-in, email verification, password reset, workspace invites and sign-in alerts are turned off. | **Not delivered**        |

With `log` or `noop`, your users get no sign-in alerts. They can still turn the **Sign-in alerts** switch on or off in their settings, and the app does not warn them that no alert will arrive.

With `log`, you can read the links in the app's log:

```bash
sudo docker compose --project-directory /opt/metis-suite logs -f app
```

## Fields

| Field                                                          | When                | Notes                                                                                                           |
| -------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **From**                                                       | `resend` and `smtp` | Required. The sender, for example `Metis Suite <noreply@example.com>`.                                          |
| **From, for sign-in mail**                                     | optional            | A different sender for sign-in links, sign-in alerts, verification and password resets. Falls back to **From**. |
| **From, for invites**                                          | optional            | A different sender for invitations. Falls back to **From**.                                                     |
| **Resend API key**                                             | `resend`            | Your Resend API key.                                                                                            |
| **SMTP URL**                                                   | `smtp`              | A full SMTP URL. Set either the URL or the host.                                                                |
| **SMTP host**, **SMTP port**, **SMTP user**, **SMTP password** | `smtp`              | Use these instead of the URL.                                                                                   |
| **Implicit TLS**                                               | `smtp`              | Turn on for a server that uses TLS from the start of the connection, usually on port 465.                       |

<img src="/images/self-hosting/driver-mail-smtp.png" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="dark:hidden" />
<img src="/images/self-hosting/driver-mail-smtp-dark.png" alt="The Mail driver page with smtp chosen, showing the sender and SMTP fields" class="hidden dark:block" />

Click **Save changes** and enter your authenticator code. Then click **Run check** in the **Health** card. It signs in to the SMTP server or checks the Resend API key. It sends nothing.

To check delivery end to end, send an invitation to an address you can read, from your account settings.

## Set the starting values in the environment

```bash
METIS_MAIL_DRIVER=smtp
MAIL_FROM=Metis Suite <noreply@example.com>
SMTP_URL=smtps://user:password@smtp.example.com:465
```

For Resend, use `METIS_MAIL_DRIVER=resend` and `RESEND_API_KEY`. Instead of `SMTP_URL`, you can use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_SECURE`. `MAIL_FROM_AUTH` and `MAIL_FROM_INVITE` set the two optional senders. After the first start, change these in the dashboard.
