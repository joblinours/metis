---
title: Dashboard settings
description: Every setting on the System pages of the owner dashboard, with the environment variable that sets its starting value.
---

These settings live under **Dashboard**, **System**. Saving any of them asks for your authenticator code and checks the change against the real service first. Secret fields show only **Set** or **Not set**. Leave a secret empty to keep the stored value.

The **Set by** column names the environment variable that gives each field its starting value. Fields marked (startup only) come only from that variable, and change only with an edit to `.env` and a restart.

## Instance

| Card                 | Field                                                                       | Set by                                                        |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **App**              | **Public URL**, **Secure cookies** (read-only)                              | `BETTER_AUTH_URL` (startup only)                              |
| **Accounts**         | **Setup code** (**Live**, **Used** or **Not set**), owner email (read-only) | `METIS_SETUP_CODE`, `METIS_OWNER_EMAIL` (startup only)        |
| **Sign-up**          | **Invite only**                                                             | `METIS_SIGNUP_DISABLED`                                       |
| **Legal consent**    | **Terms URL**, **Privacy policy URL**, **Version**                          | `METIS_TERMS_URL`, `METIS_PRIVACY_URL`, `METIS_LEGAL_VERSION` |
| **Drive relay**      | **Max transfer size (MB)**, **Transfers per user, per process**             | `METIS_DRIVE_RELAY_MAX_MB`, `METIS_DRIVE_RELAY_CONCURRENCY`   |
| **Mail image proxy** | **Proxy remote images**, **Max image size (MB)**                            | `METIS_MAIL_IMAGE_PROXY`, `METIS_MAIL_IMAGE_PROXY_MAX_MB`     |

When **Proxy remote images** is on, people can load remote images in received mail through your instance. This hides their device from the sender, but the sender can still tell that the message was opened. The card shows **On** or **Off**.

## Drivers

| Page                             | Fields                                                                                                                                                                                                   | Set by                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **LLM**                          | **Driver**, **API key**, **Base URL**, **Provider name**, **Structured outputs**, **Chat and agents model**, **Smart replies model**, **Classifier model**, **Summaries model**, **Images in summaries** | `METIS_LLM_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`                    |
| **LLM**, **Decision model** card | **Driver**, **Model**, **Base URL**, **API key**, **Inbox labels**, **Summary gate**, **Workflow Ask and Branch**, **Inbox label calls at a time**                                                       | `METIS_DECISION_*`, `OPENAI_API_KEY`                                    |
| **Phishing detection**           | **Driver**, **Backend URL**                                                                                                                                                                              | `METIS_PHISHING_DETECTION_DRIVER`, `BACKEND_URL`                        |
| **Mail**                         | **Driver**, **From**, **From, for sign-in mail**, **From, for invites**, **Resend API key**, **SMTP URL**, **SMTP host**, **SMTP port**, **SMTP user**, **SMTP password**, **Implicit TLS**              | `METIS_MAIL_DRIVER`, `MAIL_FROM*`, `RESEND_API_KEY`, `SMTP_*`           |
| **Cache**                        | **Driver**, **URL**, **Token**                                                                                                                                                                           | `METIS_CACHE_*`                                                         |
| **Workflow runner**              | **Driver**, **Cadence (seconds)**, **Tick budget (ms)**, **Batch size**, **Concurrency**, **Redis URL**, **Queue prefix**, **Cron secret**                                                               | `METIS_WORKFLOW_*`, `CRON_SECRET`                                       |
| **Database** (read-only)         | **Driver**, **App database**, and the address of the AI memory database                                                                                                                                  | `METIS_DB_DRIVER`, `DATABASE_URL`, `MASTRA_DATABASE_URL` (startup only) |

Fields that apply only to some drivers appear only when that driver is selected.

## Providers

| Page                      | Fields per entry                                                                                                                                                           | Set by                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Google**, **Microsoft** | **Client ID**, **Client secret**, plus the **Redirect URI** to register                                                                                                    | `GOOGLE_*`, `MICROSOFT_*`  |
| **Zoho**                  | **Client ID**, **Client secret**, **Region**, plus the **Redirect URI** to register                                                                                        | `ZOHO_*`                   |
| **IMAP**                  | **Name**, **IMAP host**, **IMAP port**, **IMAP implicit TLS**, **SMTP host**, **SMTP port**, **SMTP implicit TLS**, **Accept invalid TLS certificates**                    | `METIS_IMAP_SERVERS`       |
| **CalDAV**                | **Name**, **CalDAV URL**, **Accept invalid TLS certificates**                                                                                                              | `METIS_CALDAV_SERVERS`     |
| **Cloudflare Email**      | **Name**, **Domain**, **Worker endpoint**                                                                                                                                  | `METIS_CLOUDFLARE_SERVERS` |
| **Resend**                | **Name**, **Domain**, **Gateway endpoint**                                                                                                                                 | `METIS_RESEND_SERVERS`     |
| **S3**                    | **Name**, **Endpoint**, **Region**, **Access key ID**, **Secret access key**, **Path-style addressing**, **Accept invalid TLS certificates**, **Transfers**, **Checksums** | `METIS_S3_SERVERS`         |
| **WebDAV**                | **Name**, **WebDAV URL**, **Accept invalid TLS certificates**                                                                                                              | `METIS_WEBDAV_SERVERS`     |
| **FTP**                   | **Name**, **Host**, **Port**, **TLS**, **Accept invalid TLS certificates**, **Pool size**                                                                                  | `METIS_FTP_SERVERS`        |
| **SFTP**                  | **Name**, **Host**, **Port**, **Host key (SHA256)**, **Pool size**                                                                                                         | `METIS_SFTP_SERVERS`       |

For what each field does, see [Sign-in providers](/self-hosting/configure/sign-in-providers) and [Server lists](/self-hosting/configure/server-lists).

## Not in the dashboard

These are set only in the environment, and need a restart: the app address and secret, the encryption key, the setup code, the owner email, the source code link, the databases, how long the audit log keeps events (`METIS_AUDIT_RETENTION_DAYS`) and the drive relay secret. See [Environment variables](/self-hosting/reference/environment-variables).
