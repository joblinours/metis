# Metis Suite

An AI-powered mail and calendar client you host yourself. Connect Gmail, Outlook, Zoho, or any IMAP/SMTP and CalDAV server, and read it all from one place.

## Requirements

- [Bun](https://bun.sh)
- Nothing else for the database — it is a local SQLite file by default; point it at [Turso](https://turso.tech) instead if you want it hosted
- OAuth credentials from at least one mail provider, or a generic IMAP/CalDAV server to point at

## Getting started

```bash
bun install
cp apps/web/.env.example apps/web/.env.local
```

Fill in `apps/web/.env.local`. At minimum you need a database URL, two generated secrets, and one provider — see [Configuration](#configuration) below. Then create the tables and start the dev server:

```bash
bun run db:push
bun run dev
```

Open <http://localhost:3000>.

## Repository layout

This is a bun workspace with Turborepo. Every command above runs from the repository root.

| Path                                             | What it is                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `apps/web`                                       | The Metis Suite web app (Next.js). Its environment lives in `apps/web/.env.local`           |
| `apps/desktop`                                   | The desktop app (Electron) — see [apps/desktop/README.md](apps/desktop/README.md)           |
| `apps/mobile`                                    | The mobile app (Expo, iOS and Android) — see [apps/mobile/README.md](apps/mobile/README.md) |
| `apps/gateway-cloudflare`, `apps/gateway-resend` | The Cloudflare Email and Resend mail gateways                                               |
| `packages/ui`                                    | The shared shadcn components and theme                                                      |
| `packages/gateway-contract`                      | The REST contract both gateways implement                                                   |
| `e2e`                                            | The end-to-end test stack — see [e2e/README.md](e2e/README.md)                              |

`bun run typecheck` and `bun run build` run in every workspace; `bun run lint` checks the whole repository.

## Creating the first account

Sign-up is closed by default: there is no public registration form. To create the first account, set `METIS_SETUP_CODE` in your environment, then visit `/setup` and enter that code. The setup page stops working the moment an account exists.

Everyone after that joins by invitation. Any signed-in user can send one from **Settings → Invites**.

Two-factor authentication is required, so you will be taken through authenticator setup before you can reach your mail. Save the backup codes you are shown — they work anywhere a six-digit code does.

## Configuration

`apps/web/.env.example` lists the variables you are most likely to set, with comments; [agent-docs/configuration.md](agent-docs/configuration.md) lists every one. The ones you cannot skip:

| Variable                                            | What it is                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `METIS_DB_DRIVER`                                   | `sqld`, `turso` or `local` — which database the app uses. Never deploy `local`; see [Database](#database)                   |
| `DATABASE_URL`                                      | Its URL: `http(s)://…` for sqld, `libsql://…` for Turso, `file:…` for local. sqld and Turso also need `DATABASE_AUTH_TOKEN` |
| `MASTRA_DATABASE_URL`, `MASTRA_DATABASE_AUTH_TOKEN` | The AI agents' memory, on the same `METIS_DB_DRIVER`. It is a separate database from `DATABASE_URL` on purpose              |
| `BETTER_AUTH_URL`                                   | Where the app is reachable, e.g. `http://localhost:3000`                                                                    |
| `BETTER_AUTH_SECRET`                                | Random secret, 32+ characters                                                                                               |
| `METIS_ENCRYPTION_KEY`                              | 32 random bytes, base64. Encrypts stored mailbox credentials                                                                |
| `METIS_SETUP_CODE`                                  | Needed once, to create the first account                                                                                    |

Generate the two secrets with:

```bash
openssl rand -base64 32
```

**Keep `METIS_ENCRYPTION_KEY` safe and back it up.** It is a separate secret from `BETTER_AUTH_SECRET`, and losing it means every user has to reconnect every mailbox, calendar and drive.

**Everything else is configured in the dashboard.** The providers and server lists, the LLM, phishing detection, outgoing mail, the cache, the workflow runner, sign-up, legal consent and the relay limits are stored in the database the first time preflight runs, from their defaults (AI and phishing off, mail to the console, in-memory cache, the `internal` runner, no providers) or from whatever you set for them in the environment or a config file (`metis.config.{json,yaml,toml}`, interchangeable with env key by key; env wins). From then on the owner (`METIS_OWNER_EMAIL`) changes them under **Dashboard → System**, with a TOTP code; every change is checked against the real service before it is saved, kept as a version, and can be compared and restored under **System → History**. Preflight never changes them again: a value set for them that later differs only gets a warning.

Until a provider is added nothing can be connected, and the dashboard says so. Add the client ID and secret for Google, Microsoft or Zoho, or your own servers — IMAP, CalDAV, S3, WebDAV, FTP, SFTP, or a self-hosted Cloudflare or Resend mail gateway — under the provider pages of **Dashboard → System**, or seed them with the `METIS_*_SERVERS` JSON variables (see `.env.example`). Only providers you configure are offered in the connect dialog.

Google Drive, OneDrive and S3 send files straight between the browser and the provider. WebDAV, FTP and SFTP drives are relayed through the app instead, because the browser cannot send a WebDAV server its credentials and cannot speak FTP or SSH at all. Each SFTP server entry must pin the server's host key (`hostKeySha256`, as `ssh-keygen -l` prints it); a server presenting any other key is refused. An FTP or SFTP server entry's `poolSize` (default 2 for FTP, 3 for SFTP) is the total number of connections the app opens to that server across all users, so keep it under the server's per-IP connection limit. An S3 server entry can opt into the same relay with `"transfer": "relay"`: use it when browsers cannot reach the endpoint, the certificate is self-signed, or the bucket cannot be given a CORS rule. `METIS_DRIVE_RELAY_MAX_MB` (default 256) caps each transfer and `METIS_DRIVE_RELAY_CONCURRENCY` (default 3) caps simultaneous relayed transfers per user. The relay speaks S3's SigV4 presigned-URL protocol, so a relayed download or upload is a short-lived signed link like an S3 one; `METIS_DRIVE_RELAY_SECRET` (32+ characters) signs those links and is required as soon as any relayed server is listed. The relay needs an always-on server (`next start` or the Docker image), not a serverless host.

The AI assistant, phishing detection, outbound email and caching each run on a pluggable driver and are configured the same way. Every one of them can be turned off.

### Decision models

A decision model is an optional second AI backend. It answers typed questions (yes/no, pick one, rate) about a message with probabilities, in one call, and writes no text. Nothing uses it unless you turn a feature on: setting `METIS_DECISION_DRIVER` alone changes nothing, and each feature has its own switch, all off by default (`METIS_DECISION_CLASSIFIER`, `METIS_DECISION_SUMMARY_GATE`, `METIS_DECISION_WORKFLOW_NODE`). The switches are ignored while `METIS_DECISION_DRIVER` is disabled. A decision model is an addition to the LLM, never a replacement: the app refuses to start when a switch is on while `METIS_LLM_DRIVER` is disabled. The workspace and per-mailbox AI switches cover decision calls exactly as they cover LLM calls.

| Driver      | Where it runs                                                                                                                                               | Set                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `systemone` | Any server that speaks `/systemone`: TypeSafe's hosted Jev (about $0.04 per million input tokens, the default base URL) or a local one such as Ollama 0.35+ | `METIS_DECISION_MODEL`, `METIS_DECISION_BASE_URL`, `METIS_DECISION_API_KEY` (optional; a placeholder is sent when unset) |
| `openai`    | OpenAI's Decisions API, `gpt-6-luna` only (public beta, $0.10 per million input tokens)                                                                     | `METIS_DECISION_MODEL=gpt-6-luna`, `OPENAI_API_KEY`                                                                      |

**What leaves the instance:** the same message fields the LLM features send (sender, subject, a snippet, and the body only where a feature asks for it), and only for mailboxes whose AI toggle is on in that workspace. Preflight warns when `systemone` has no API key, and when a switch is on it lists the provider's models (a free call, no decision is billed) and warns, without failing, if the key is rejected, the server is unreachable or the model is not listed. `/dashboard/system` shows the driver, model and switches on its LLM page.

### Database

`METIS_DB_DRIVER` picks one of three drivers. Each checks that its URL has the right scheme and that it has a token when it needs one.

| Driver  | `DATABASE_URL`               | `DATABASE_AUTH_TOKEN` | Use it for                                                 |
| ------- | ---------------------------- | --------------------- | ---------------------------------------------------------- |
| `sqld`  | `http(s)://…` or `ws(s)://…` | required              | Deployments and verification: `compose.yml`, via bootstrap |
| `turso` | `libsql://<db>.turso.io`     | required              | Deployments on Turso                                       |
| `local` | `file:./metis.db`            | —                     | Nothing but a single `next dev` on your own machine        |

**`local` is never to be used for a deployment, a verification run or any shared setup.** A local file behind `@libsql/client` fails exactly where a mail client needs it to hold:

- **It contends with itself.** `@libsql/client` 0.18 pools up to 20 connections to one file with a busy timeout of 0. Two writes that overlap in one process — two requests, or a request and a workflow tick — fail at once with `SQLITE_BUSY`.
- **It silently loses writes.** In `libsql` 0.5.29, a statement that fails with `SQLITE_BUSY` is left active while its connection still reports that it is not in a transaction. The pool reuses that connection. Every later write on it reports success but is never committed, and it keeps holding the write lock, so other writers keep failing until the process restarts.
- **A busy timeout does not fix it.** The driver is synchronous, so waiting for the lock freezes the event loop, including the code that holds the lock.
- **It can leave auth broken.** Better Auth writes on startup. If that write hits `SQLITE_BUSY`, sign-in stays broken until the process restarts.
- **It cannot be shared.** The web app and the bullmq worker are separate processes, and two processes on one file hit all of the above.

**sqld** is the libSQL server, and the server serializes writes itself, so the app and the worker share it safely.

- `compose.yml` runs one [sqld](https://github.com/tursodatabase/libsql/tree/main/libsql-server) as the `sqld` service, behind the `sqld` profile, with namespaces on: the app's database is the `app` namespace (`http://app.sqld:8080`) and Mastra's the `mastra` namespace (`http://mastra.sqld:8080`), both in the `metis_sqld` volume. Only its admin API is published, on `127.0.0.1` and an ephemeral port, and it requires the `SQLD_ADMIN_KEY` bootstrap generates; bootstrap uses it to create the two namespaces.
- The image is pinned by digest (`SQLD_IMAGE` overrides it). Updates, security patches included, arrive only when you change the pin and re-run bootstrap.
- It is protected with JWT auth. Bootstrap generates an Ed25519 key pair and writes the public key (`SQLD_AUTH_JWT_KEY`, passed only to sqld) and a read-write token (`DATABASE_AUTH_TOKEN`, used by the app, preflight and worker) into `.env`. The private key is discarded, so to rotate, delete `.env` and run bootstrap again. Without bootstrap, `bash bootstrap.sh sqld-auth` prints a pair.
- **It rolls back an interactive transaction that has been open for 5 seconds when another writer is waiting for it**, and that transaction's commit fails with `TRANSACTION_TIMEOUT`. There is no setting for this. Keep transactions short and database-only.

**Turso:** export `METIS_DB_DRIVER=turso` with `libsql://` URLs and tokens for both databases (`DATABASE_*` and `MASTRA_DATABASE_*`) before running bootstrap. It then leaves the `sqld` profile off.

**Mastra's database** (agent memory, threads, traces) is a separate database with its own connection, `MASTRA_DATABASE_URL` and `MASTRA_DATABASE_AUTH_TOKEN`, on the same `METIS_DB_DRIVER`. Hybrid deployments are not supported: both databases use the one driver, and each URL must match it.

- In the stack it is the `mastra` namespace of the same sqld. A namespace is its own SQLite database, so Mastra's writes never wait on the app's.
- One `SQLD_AUTH_JWT_KEY` covers both namespaces, so bootstrap writes the same token into `DATABASE_AUTH_TOKEN` and `MASTRA_DATABASE_AUTH_TOKEN`.
- For Turso, export `METIS_DB_DRIVER=turso` and both URLs and tokens before running bootstrap. sqld does not start.

### Background work

Workflows, send-later, snooze wake-ups and housekeeping all run through one engine. Choose how it is woken under **Dashboard → System → Workflow runner** (or seed it with the `METIS_WORKFLOW_*` variables); the default is `internal`, and a change reaches every process within 30 seconds with no redeploy.

**`internal`** (default) — see below; nothing else to run.

**`bullmq`** — run the published worker image (`ghcr.io/trymetis/metis:latest-worker`) anywhere — the same host, another VPS — with a Redis of your own (persistence on, `maxmemory-policy noeviction`, hosted or self-run), and enter the Redis URL in the dashboard. The worker needs only `METIS_DB_DRIVER`, `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `MASTRA_DATABASE_*`, `METIS_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, and must reach the same database. It reads the rest from the database, owns the cadence, and idles while the driver is anything else. The root `compose.yml` does not run it.

**`cron`** — no Redis and no worker. Point any external scheduler (cron-job.org, Vercel cron, a crontab) at the app, at least as often as the cadence (default 60 s), with the secret you set in the dashboard:

```bash
curl -fsS -X POST https://your-host/api/workflows/tick \
  -H "X-Metis-Secret: $CRON_SECRET"
```

**`internal`** — no Redis, no worker and no external scheduler. The app runs the engine itself: when the server starts, before any request arrives, it runs one tick and then one every cadence. If a tick runs longer than the cadence, the next interval is skipped rather than queued. It is for always-on deployments only: a Node server that runs continuously (`next start`, the Docker image, a VM) with at least one instance that is never stopped or suspended. Serverless and scale-to-zero hosts never work with it, because nothing ticks while the process is asleep. That includes Cloud Run with minimum instances at 0, Fly machines with auto-stop, and sleeping free tiers. Use `cron` or `bullmq` there. The dashboard refuses to select `internal`, and preflight warns when it stores it as the default, on the hosts it can recognize: Vercel, Netlify, AWS Lambda, Azure Functions and Google Cloud Functions. On those, switch the runner to `cron` after the first sign-in. Workflows share the web process's CPU, memory and restarts, so a heavy backlog slows requests. Several app instances never duplicate work, because the database claims decide which instance does each piece of work. Run them against a database server (sqld or Turso), never a shared local file; see [Database](#database). The tick endpoint answers `404` in this mode.

All three drivers share the same database-backed engine, so schedules, retries and history behave identically. Cadence, tick budget, batch size and concurrency tune all of them. The web app and the worker must use the same `DATABASE_URL` and `METIS_ENCRYPTION_KEY`.

#### Operating the runner

The owner dashboard's **Automation** page (`/dashboard/automation`, visible only to `METIS_OWNER_EMAIL`) shows whether ticks are arriving and how much work is overdue. Every tick also logs one line, from the worker in `bullmq` mode or from the app in `cron` and `internal` mode (`internal` lines add `trigger=start|interval`):

```
[workflow-runner] tick driver=cron outcome=worked invocation=cron:41:9f1c… started=2026-09-27T10:00:00.012Z durationMs=812 discovery=ran discovered=3 discoveryErrors=0 claimed=3 completed=3 failed=0 blocked=0 remaining=0
[workflow-runner] tick driver=bullmq outcome=failed invocation=bullmq:7:c02e… job=repeat:workflow-cadence:1790000000000 attempt=1 … stage=setup code=SQLITE_BUSY
```

`outcome` is `worked` when the tick discovered or claimed anything, `idle` otherwise, and `failed` on an infrastructure error. A failure names the `stage` (`setup`, `discovery`, `maintenance`, `execution`) and an error `code` only. The `[workflow-runner]`, `[workflow-worker]` and `[workflow]` lines, the tick response and the dashboard carry ids, counts and codes, never message contents, recipients, credentials or query parameters. A workflow that fails is not a tick failure: it shows in `failed`/`blocked` and in that workflow's history. `discoveryErrors` counts new-mail triggers that could not be checked on this tick — the owner left, the mailbox is no longer visible or attached, or the provider scan failed. It comes back each time that trigger is due (once per cadence) until the cause is fixed; the trigger node in the editor shows "Last check failed: …" and the dashboard counts erroring triggers.

- **Cadence versus budget (`cron`).** The cadence is how often discovery may run, not how often your scheduler calls. Call at least that often; calling more often is harmless and drains ready work sooner, calling less often only adds latency. Each call runs for up to the tick budget and answers with a JSON summary — `200`, or `500` with `failure` on an infrastructure error, `401` for a wrong or missing `X-Metis-Secret` (logged as `tick rejected`, at most once a minute per reason, with the number of rejections since the last line), `404` when the driver is not `cron`. Keep the budget under your host's request limit (the route allows 60 s) and your scheduler's timeout above it.
- **Redis outage (`bullmq`).** No work is lost: schedules, runs and retries live in the database. The worker logs `redis source=… code=…` at most once a minute per error and stops receiving ticks until Redis is back, then catches up on the next tick. A worker that starts while Redis is down waits for it rather than exiting.
- **Worker shutdown and restart.** `SIGTERM`/`SIGINT` stop taking new ticks and wait for the active one (at most the tick budget) before exiting, so give the worker's container or process manager a stop timeout longer than the budget (the default budget is 45 s, so 75 s is enough). If the process is killed instead, its claims expire after two minutes and the next tick picks the runs up again. A send that was already leaving is not retried — it shows as unconfirmed in the scheduled view, where a person verifies or closes it. Startup exits non-zero with `not ready database=false …` when the database cannot be queried; a local database file that cannot be opened at all fails earlier, with libSQL's own error. It does not exit for Redis, it waits (see above).
- **App shutdown and restart (`internal`).** On `SIGTERM`/`SIGINT` the app stops its timer and aborts the active tick. From then on the tick starts no new step and hands back runs it had claimed but not started. Next.js keeps its own shutdown and exits as soon as its in-flight HTTP requests finish. So the active tick is not awaited past that point, and a longer stop timeout does not give it more time. Whatever the exit cuts off is recovered like a killed worker: claims expire after two minutes, the next tick after a restart picks those runs up, and a send that was already leaving shows as unconfirmed. A restart catches up on its first tick, which runs at startup.
- **Backlog.** `remaining` in each tick line and the dashboard's backlog age show queued work. Each tick claims up to `METIS_WORKFLOW_BATCH_SIZE` runs, `METIS_WORKFLOW_CONCURRENCY` at a time, until the budget runs out, so a backlog drains over several ticks on its own. To drain faster, call the tick endpoint more often (`cron`) or raise batch size and concurrency.
- **Switching drivers.** Change the driver under **Dashboard → System → Workflow runner**; every process picks it up within 30 seconds, with no redeploy. Nothing needs migrating, because every driver runs the same engine on the same database, and while old and new overlap for a moment both may tick, which is harmless. Moving to `internal`: each app process starts its timer; stop your worker and remove any external scheduler. Moving away from `internal`: the app processes stop their timers. Moving to `cron`: set the cron secret in the same edit and start your scheduler; the endpoint answers `404` until the driver is `cron`. Moving to `bullmq`: start the worker and Redis first and enter the Redis URL in the same edit — without a worker nothing ticks: work waits in the database and the Automation page shows `never` or `delayed`.

### Connecting mailboxes

Register these redirect URIs in the provider's console, substituting your own host:

```
http://localhost:3000/api/connections/google/callback
http://localhost:3000/api/connections/microsoft/callback
http://localhost:3000/api/connections/zoho/callback
```

Then connect accounts from **Settings → Mailboxes** and **Settings → Calendars**.

## Deploying

Run `bun run --cwd apps/web preflight` once per deployment, before the server starts. It creates the database schema if it is missing, verifies every server in the environment, stores the runtime settings in the database the first time (from the environment, a config file and the defaults; afterwards it only warns where they differ from what is stored), and reconciles connections whose provider credentials have changed.

It ships as its own image, built from `preflight.Dockerfile` and published beside the app image as `ghcr.io/trymetis/metis:<version>-preflight`: one bundled script, the schema and the `libsql` native module, with no full `node_modules`. Every server release, a GitHub release tagged `app-v<version>`, publishes `:<version>`, `:<version>-preflight`, `:<version>-worker` and `:<version>-updater`, beside the rolling `latest*` tags, and publishes `bootstrap.sh` and `compose.yml` to `https://sh.trymetis.email/v<version>/`.

`compose.yml` runs it as the one-shot `preflight` service. The app starts only after it completes successfully, and it waits for sqld to be healthy first. The stack is sqld, preflight, the app and the updater, plus Caddy once a domain is set.

**`bootstrap.sh` deploys that compose file.** It installs Docker with the Compose plugin and writes `/opt/metis-suite/.env` with only what has to be in the environment: the URL and secrets, the database and the first-run setup. On every run it pins the release: `APP_IMAGE`, `PREFLIGHT_IMAGE`, `WORKER_IMAGE` and `UPDATER_IMAGE` go into `.env` at `METIS_VERSION` when you export it, otherwise at the latest release in the registry, or at the rolling `latest*` tags when it finds none; an exported `*_IMAGE` wins over all of them. It then downloads the `compose.yml` of the release it pinned, `https://sh.trymetis.email/v<version>/compose.yml` (`COMPOSE_URL` overrides the whole URL). With the stack's own sqld it starts sqld and creates the `app` and `mastra` namespaces, then runs `docker compose pull` and `up -d` with the profiles the `.env` calls for: `sqld` for the sqld driver at the stack's own URL, and `proxy` when `METIS_DOMAIN` is set. It removes services whose profile is off. `SQLD_IMAGE` and `CADDY_IMAGE` pass straight through to Compose. Afterwards, manage the stack with `docker compose --project-directory /opt/metis-suite ps | logs -f app | …`.

**Upgrades** are applied from **Dashboard → System → Updates**. The `updater` service, the only container with the Docker socket, pulls the chosen release, runs its preflight, switches the app and waits for `/api/readyz`, switching back on its own when a step fails. Any listed release can be chosen, older ones included. It rewrites the app's pins in `.env` and never its own; re-running bootstrap re-pins all four images (the updater included) and picks up a changed `compose.yml`. `/api/livez` and `/api/readyz` answer without a session for your monitoring.

- **Headless (cloud-init):** export the variables you want, then run `sudo -E bash bootstrap.sh`.
  - Providers, AI, mail, the cache, phishing detection and the workflow runner are not asked for. Any of their variables you export is copied into `.env` and seeds the first config; anything else starts at its default and is set under **Dashboard → System** after the first sign-in.
  - `BETTER_AUTH_SECRET`, `METIS_ENCRYPTION_KEY`, `METIS_DRIVE_RELAY_SECRET` and `METIS_SETUP_CODE` are generated if unset. Back up the encryption key. The setup code is printed in full, because it is what opens `/setup`.
  - `BETTER_AUTH_URL` defaults to `http://localhost:<APP_PORT>`, because the app is published on `127.0.0.1` only. `domain` switches it to `https://`.
- **Interactive:** `sudo -E bash bootstrap.sh --interactive` prompts for anything not exported.
- **An existing `.env` is kept as is**, except for the release pins, which every run rewrites. Delete it to regenerate.
- **Domain and HTTPS:** once DNS points at the server, run `sudo bash bootstrap.sh domain example.com`, or export `METIS_DOMAIN` before the first run.
  - It writes `METIS_DOMAIN` and `BETTER_AUTH_URL=https://…` into `.env` and redeploys with the `proxy` profile.
  - That profile starts the `caddy` service: `caddy reverse-proxy` to `app:3000`, publishing 80 and 443 (TCP, plus UDP for HTTP/3), with its certificates in the `metis_caddy_data` volume and its config in `metis_caddy_config`.
  - Caddy gets and renews the certificate itself. Nothing is installed on the host.
- **Before a domain:** the app listens on `127.0.0.1:<APP_PORT>` only, because without a domain there is no HTTPS, and over plain `http://` the session cookies are not marked `Secure`. Reach it, and `/setup`, through an SSH tunnel: `ssh -L 3000:127.0.0.1:3000 <user>@<server>`, then open `http://localhost:3000`.
- **sqld credentials:** `bash bootstrap.sh sqld-auth` prints a sqld key and token pair, for stacks that don't run bootstrap.

If you deploy to a platform that builds from source, set the project root to `apps/web` and use `bun run preflight && bun run start` as the start command. The Docker images build from the repository root (`docker build --target runner .`).

## Documentation

- [AGENTS.md](AGENTS.md) — architecture and implementation reference
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [SECURITY.md](SECURITY.md) — please report vulnerabilities privately, not as public issues

## License

Metis Suite is released under the [GNU Affero General Public License v3.0 or later](LICENSE).

You may run, modify and redistribute it freely. If you modify it and let others use it over a network, AGPL section 13 requires you to offer those users the corresponding source of your modified version. Every page shows a "Source code" link with the running version for this; set `METIS_SOURCE_URL` to where your modified source lives (it defaults to this repository, which is not your version's source).

Third-party licenses: `bun run --cwd apps/web licenses` writes `apps/web/THIRD_PARTY_LICENSES.txt` covering the production dependency tree. The Docker image carries it at `/app/THIRD_PARTY_LICENSES.txt` beside `LICENSE` and `NOTICE`. Source copied into this repository rather than installed is attributed in [NOTICE](NOTICE).

For terms other than the AGPL, contact contact@astraqcyberdefence.com.
