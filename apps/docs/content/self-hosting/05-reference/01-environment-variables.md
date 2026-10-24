---
title: Environment variables
description: Every environment variable a Metis Suite instance reads, grouped by topic, with defaults.
---

Each variable is one of two kinds:

- **Startup:** read every time the app starts. Change it in `.env` and restart the app.
- **Starting value:** read once, the first time preflight runs, to fill in a setting the owner then manages in the dashboard. For a setting that a release moves into the dashboard, it is read once, on the first preflight after that update. After that, change it under **Dashboard**, **System**. See [How configuration works](/self-hosting/configure/how-configuration-works).

Any variable can also come from the optional config file. A wrong value stops the app from starting, and the error names the variable.

## Core

| Variable               | Kind    | What it does                                                                                                         | Default                             |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `BETTER_AUTH_URL`      | Startup | The address people use to reach the app. An `https://` address turns on secure cookies.                              | `http://localhost:3000`             |
| `BETTER_AUTH_SECRET`   | Startup | The app's secret. At least 32 characters. Required.                                                                  |                                     |
| `METIS_ENCRYPTION_KEY` | Startup | Protects stored passwords and tokens. 32 random bytes, base64 (`openssl rand -base64 32`). Required. Back it up.     |                                     |
| `METIS_SETUP_CODE`     | Startup | Opens `/setup` to create the first account. At least 8 characters.                                                   | Not set                             |
| `METIS_OWNER_EMAIL`    | Startup | The owner's email. Only this account sees the owner dashboard. When not set, nobody does.                            | Not set                             |
| `METIS_SOURCE_URL`     | Startup | Where the **Source code** link on every page goes. See [Source code link](/self-hosting/configure/source-code-link). | `https://github.com/trymetis/metis` |

## Database

| Variable                     | Kind    | What it does                                                                                                                   | Default |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `METIS_DB_DRIVER`            | Startup | `sqld` (a libSQL server, as in the Compose stack), `turso`, or `local` (a file, for development only, never for a deployment). |         |
| `DATABASE_URL`               | Startup | The app database: `http(s)://` or `ws(s)://` for sqld, `libsql://` for Turso, `file:` for local.                               |         |
| `DATABASE_AUTH_TOKEN`        | Startup | Its token. Required for sqld and Turso.                                                                                        |         |
| `MASTRA_DATABASE_URL`        | Startup | The AI memory database. A separate database on the same driver.                                                                |         |
| `MASTRA_DATABASE_AUTH_TOKEN` | Startup | Its token.                                                                                                                     |         |
| `SQLD_AUTH_JWT_KEY`          | Startup | The bundled database server's public key. The bootstrap script generates it.                                                   |         |
| `SQLD_ADMIN_KEY`             | Startup | The key for the bundled database server's admin access. The bootstrap script generates it.                                     |         |

For a stack you set up without the bootstrap script, `bash bootstrap.sh sqld-auth` prints a matching `SQLD_AUTH_JWT_KEY` and token pair.

## Sign-in providers

| Variable                                         | Kind           | What it does                         | Default |
| ------------------------------------------------ | -------------- | ------------------------------------ | ------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`       | Starting value | Your Google OAuth client.            | Not set |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Starting value | Your Microsoft app registration.     | Not set |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`           | Starting value | Your Zoho OAuth client.              | Not set |
| `ZOHO_REGION`                                    | Starting value | `com`, `in`, `eu`, `com.au` or `jp`. | `com`   |

## Server lists

Each is a JSON array of server entries, used as a starting value. See [Server lists](/self-hosting/configure/server-lists).

Every entry has a `name` (1 to 64 characters, unique) and an optional `id` (letters, digits, `-` and `_`, unique). Hosts are hostnames, never URLs.

| Variable                   | Keys, with defaults                                                                                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `METIS_IMAP_SERVERS`       | `imap.host`, `imap.port` (993), `imap.secure` (true), `smtp.host`, `smtp.port` (465), `smtp.secure` (true), `allowInsecureTls` (false)                                                                                                                               |
| `METIS_CALDAV_SERVERS`     | `url` (the full URL, with `https://`), `allowInsecureTls` (false)                                                                                                                                                                                                    |
| `METIS_CLOUDFLARE_SERVERS` | `domain` (a bare domain such as `example.com`), `endpoint` (an `https://` URL)                                                                                                                                                                                       |
| `METIS_RESEND_SERVERS`     | `domain`, `endpoint` (an `https://` URL)                                                                                                                                                                                                                             |
| `METIS_S3_SERVERS`         | `endpoint` (`http://` or `https://`), `region` (`us-east-1`), `accessKeyId`, `secretAccessKey`, `forcePathStyle` (true), `allowInsecureTls` (false), `transfer` (`direct` or `relay`, default `direct`), `checksums` (`required` or `supported`, default `required`) |
| `METIS_WEBDAV_SERVERS`     | `url`, `allowInsecureTls` (false)                                                                                                                                                                                                                                    |
| `METIS_FTP_SERVERS`        | `host`, `port` (21), `secure` (`explicit`, `implicit` or `none`, default `explicit`), `allowInsecureTls` (false), `poolSize` (1 to 10, default 2)                                                                                                                    |
| `METIS_SFTP_SERVERS`       | `host`, `port` (22), `hostKeySha256` (required, as `ssh-keygen -l` prints it), `poolSize` (1 to 10, default 3)                                                                                                                                                       |

## Drive transfers

| Variable                        | Kind           | What it does                                                                          | Default |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------- | ------- |
| `METIS_DRIVE_RELAY_SECRET`      | Startup        | Needed for relayed drives (WebDAV, FTP, SFTP and relayed S3). At least 32 characters. | Not set |
| `METIS_DRIVE_RELAY_MAX_MB`      | Starting value | The largest relayed file, in MB.                                                      | `256`   |
| `METIS_DRIVE_RELAY_CONCURRENCY` | Starting value | Relayed transfers one person can run at a time.                                       | `3`     |

## Mail images

These are starting values for the **Mail image proxy** card on the dashboard's **Instance** page.

| Variable                        | Kind           | What it does                                                                                                | Default |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_MAIL_IMAGE_PROXY`        | Starting value | When `true`, remote images in mail load through your instance instead of straight from the sender's server. | `false` |
| `METIS_MAIL_IMAGE_PROXY_MAX_MB` | Starting value | The largest image the proxy loads, in MB. At most 100.                                                      | `10`    |

## AI model (LLM)

| Variable                       | Kind           | What it does                                                                                                | Default    |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `METIS_LLM_DRIVER`             | Starting value | `openai`, `anthropic`, `openai-compatible` or `disabled`.                                                   | `disabled` |
| `OPENAI_API_KEY`               | Starting value | The key for `openai`. Also the starting key of the `openai` decision model.                                 |            |
| `ANTHROPIC_API_KEY`            | Starting value | The key for `anthropic`.                                                                                    |            |
| `METIS_LLM_API_KEY`            | Starting value | The key for `openai-compatible`. Optional.                                                                  |            |
| `METIS_LLM_BASE_URL`           | Starting value | The API address, for `openai-compatible`.                                                                   |            |
| `METIS_LLM_NAME`               | Starting value | A name for the provider, for `openai-compatible`. Optional.                                                 |            |
| `METIS_LLM_STRUCTURED_OUTPUTS` | Starting value | Use structured outputs, for `openai-compatible`. When off, summaries need about an 8k-token context window. | `false`    |
| `METIS_LLM_CHAT_MODEL`         | Starting value | The model for the assistant and agents. Required when a driver is on.                                       |            |
| `METIS_LLM_SMART_REPLY_MODEL`  | Starting value | The model for suggested replies. Required when a driver is on.                                              |            |
| `METIS_LLM_CLASSIFIER_MODEL`   | Starting value | The model for labels. Required when a driver is on.                                                         |            |
| `METIS_LLM_SUMMARY_MODEL`      | Starting value | The model for summaries. Required when a driver is on.                                                      |            |
| `METIS_LLM_SUMMARY_VISION`     | Starting value | Send images to the summaries model.                                                                         | `false`    |

## Decision model

All of these are starting values for the **Decision model** card on the dashboard's **LLM** page. See [AI models](/self-hosting/configure/ai-models#add-a-decision-model-optional).

| Variable                          | Kind           | What it does                                                                   | Default                      |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| `METIS_DECISION_DRIVER`           | Starting value | `systemone`, `openai` or `disabled`.                                           | `disabled`                   |
| `METIS_DECISION_MODEL`            | Starting value | The model. Required unless disabled.                                           |                              |
| `METIS_DECISION_BASE_URL`         | Starting value | The server address, for `systemone`.                                           | `https://api.typesafe.ai/v1` |
| `METIS_DECISION_API_KEY`          | Starting value | The key, for `systemone`. Optional. The `openai` driver uses `OPENAI_API_KEY`. |                              |
| `METIS_DECISION_CLASSIFIER`       | Starting value | Use it for inbox labels.                                                       | `false`                      |
| `METIS_DECISION_SUMMARY_GATE`     | Starting value | Use it as the summary gate.                                                    | `false`                      |
| `METIS_DECISION_WORKFLOW_NODE`    | Starting value | Use it in workflow Ask and Branch steps.                                       | `false`                      |
| `METIS_DECISION_CLASSIFIER_BATCH` | Starting value | Inbox label calls at a time, 1 to 25.                                          | `5`                          |

A decision switch does nothing while the LLM driver is `disabled`, because AI is off for the whole instance. If preflight stores a switch that is on without an LLM, the deploy checks show a warning. The dashboard refuses to save a change that leaves a switch on without an LLM.

## Phishing detection

| Variable                          | Kind           | What it does                                                    | Default    |
| --------------------------------- | -------------- | --------------------------------------------------------------- | ---------- |
| `METIS_PHISHING_DETECTION_DRIVER` | Starting value | `metis` or `disabled`.                                          | `disabled` |
| `BACKEND_URL`                     | Starting value | The phishing detection backend's address. Required for `metis`. |            |

## Outgoing email

| Variable                                           | Kind           | What it does                                                 | Default                           |
| -------------------------------------------------- | -------------- | ------------------------------------------------------------ | --------------------------------- |
| `METIS_MAIL_DRIVER`                                | Starting value | `log` (write to the server log), `noop`, `resend` or `smtp`. | `log`                             |
| `MAIL_FROM`                                        | Starting value | The sender. Required for `resend` and `smtp`.                | `Metis Suite <noreply@localhost>` |
| `MAIL_FROM_AUTH`                                   | Starting value | The sender for sign-in mail, including sign-in alerts.       | `MAIL_FROM`                       |
| `MAIL_FROM_INVITE`                                 | Starting value | The sender for invitations.                                  | `MAIL_FROM`                       |
| `RESEND_API_KEY`                                   | Starting value | Your Resend API key, for `resend`.                           |                                   |
| `SMTP_URL`                                         | Starting value | A full SMTP URL, for `smtp`. Set this or `SMTP_HOST`.        |                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Starting value | The SMTP server, in parts.                                   |                                   |
| `SMTP_SECURE`                                      | Starting value | Use TLS from the start of the connection.                    |                                   |

## Cache

| Variable             | Kind           | What it does                                                                                                                                                                                       | Default  |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `METIS_CACHE_DRIVER` | Starting value | `memory`, `redis` or `upstash`. With `memory`, each process keeps its own sessions and rate-limit counters and loses them on restart. Use `redis` or `upstash` when you run more than one process. | `memory` |
| `METIS_CACHE_URL`    | Starting value | The Redis or Upstash address.                                                                                                                                                                      |          |
| `METIS_CACHE_TOKEN`  | Starting value | The Upstash token.                                                                                                                                                                                 |          |

## Background work

See [Background work](/self-hosting/configure/background-work).

| Variable                        | Kind           | What it does                                                            | Default           |
| ------------------------------- | -------------- | ----------------------------------------------------------------------- | ----------------- |
| `METIS_WORKFLOW_RUNNER_DRIVER`  | Starting value | `internal`, `cron` or `bullmq`.                                         | `internal`        |
| `METIS_WORKFLOW_CADENCE_SEC`    | Starting value | Seconds between ticks, 1 to 86400.                                      | `60`              |
| `METIS_WORKFLOW_TICK_BUDGET_MS` | Starting value | How long one tick may run, 1000 to 600000 (at most 55000 under `cron`). | `45000`           |
| `METIS_WORKFLOW_BATCH_SIZE`     | Starting value | Work taken per round, 1 to 500.                                         | `25`              |
| `METIS_WORKFLOW_CONCURRENCY`    | Starting value | Work run at the same time, 1 to 64.                                     | `4`               |
| `METIS_WORKFLOW_REDIS_URL`      | Starting value | Your Redis, for `bullmq`.                                               |                   |
| `METIS_WORKFLOW_QUEUE_PREFIX`   | Starting value | The queue name prefix, for `bullmq`.                                    | `metis-workflows` |
| `CRON_SECRET`                   | Starting value | The secret your scheduler sends in `X-Metis-Secret`, for `cron`.        |                   |

## Sign-up and legal

| Variable                | Kind           | What it does                                      | Default |
| ----------------------- | -------------- | ------------------------------------------------- | ------- |
| `METIS_SIGNUP_DISABLED` | Starting value | `true` for invite only, `false` for open sign-up. | `true`  |
| `METIS_TERMS_URL`       | Starting value | Your terms of service.                            | Not set |
| `METIS_PRIVACY_URL`     | Starting value | Your privacy policy.                              | Not set |
| `METIS_LEGAL_VERSION`   | Starting value | The version of your terms that people agree to.   | `1`     |

## Audit log

See [Owner dashboard](/self-hosting/operate/owner-dashboard#audit-log).

| Variable                     | Kind    | What it does                                                                                                                                                                                                                                                                           | Default |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `METIS_AUDIT_RETENTION_DAYS` | Startup | How many days the audit log keeps each event. A whole number, 1 or more. Every day at 03:30 UTC, events older than this are deleted, so lowering it removes older events at the next run. It cannot be changed in the dashboard. In the config file, the key is `audit.retentionDays`. | `365`   |

## Other

| Variable               | Kind    | What it does                                                                                                  | Default        |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------- | -------------- |
| `METIS_CONFIG_PATH`    | Startup | The path of the config file. If the file does not exist, the app does not start.                              | Not set        |
| `METIS_UPDATER_SOCKET` | Startup | Connects the app to the updater. The Compose stack sets it for you. Without it, there is no **Updates** page. | Set by Compose |

## Bootstrap script

These are read by the bootstrap script only. See [Install with the bootstrap script](/self-hosting/install/install-with-bootstrap).

| Variable                                                        | What it does                                            | Default                                             |
| --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `METIS_DOMAIN`                                                  | Your domain. When set, Caddy serves the app over HTTPS. | Not set                                             |
| `METIS_VERSION`                                                 | The release to install, such as `1.2.3`.                | The newest release                                  |
| `INSTALL_DIR`                                                   | Where the stack is installed.                           | `/opt/metis-suite`                                  |
| `APP_PORT`                                                      | The port the app listens on, on `127.0.0.1`.            | `3000`                                              |
| `COMPOSE_URL`                                                   | A full URL for the Compose file.                        | The Compose file of the release the script installs |
| `APP_IMAGE`, `PREFLIGHT_IMAGE`, `WORKER_IMAGE`, `UPDATER_IMAGE` | Exact images to use instead of a release.               |                                                     |
| `SQLD_IMAGE`, `CADDY_IMAGE`                                     | Other images for the database server and Caddy.         |                                                     |
