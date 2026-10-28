---
title: Ports and endpoints
description: The ports the Compose stack uses, the outbound access it needs, and the app's operator-facing addresses.
---

## Ports on the server

| Port                    | Service                                    | Reachable from                                            |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------- |
| `80` TCP                | Caddy, for HTTP and certificate checks     | The internet, once a domain is set                        |
| `443` TCP and UDP       | Caddy, for HTTPS and HTTP/3                | The internet, once a domain is set                        |
| `3000` TCP (`APP_PORT`) | The app                                    | `127.0.0.1` only. Reach it through Caddy or an SSH tunnel |
| A random port           | The bundled database server's admin access | `127.0.0.1` only, protected by `SQLD_ADMIN_KEY`           |

The updater publishes no port. The app reaches it inside the stack.

A Resend gateway listens on port `8787` by default (`PORT`).

## Outbound access

| Host                                                  | Why                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `ghcr.io`                                             | The Metis Suite images and the list of releases                                                |
| `sh.trymetis.email`                                   | The Compose file, downloaded by the bootstrap script                                           |
| `download.docker.com` and your Ubuntu package mirrors | Installing Docker and the tools the bootstrap script needs                                     |
| Your providers and servers                            | Google, Microsoft, Zoho, and every server in your lists                                        |
| Your AI, email and other services                     | Your LLM provider, Resend or SMTP, Redis, and your phishing detection backend, if you use them |

## Endpoints

| Address                               | Method  | What it is                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/setup`                              | Browser | Creates the first account with the setup code. Stops working once any account exists.                                                                                                                                                                                                                                                                        |
| `/dashboard`                          | Browser | The owner dashboard. Only the owner can open it.                                                                                                                                                                                                                                                                                                             |
| `/api/livez`                          | `GET`   | `200` while the app serves requests. No sign-in needed.                                                                                                                                                                                                                                                                                                      |
| `/api/readyz`                         | `GET`   | `200` when the settings loaded and both databases answer, `503` otherwise. No sign-in needed.                                                                                                                                                                                                                                                                |
| `/api/workflows/tick`                 | `POST`  | Runs one round of background work, under the `cron` runner. Needs the `X-Metis-Secret` header. Answers `404` under other runners.                                                                                                                                                                                                                            |
| `/api/inbound/<endpoint>`             | `POST`  | Receives workflow webhook requests and change notifications (push) from Google Calendar, Google Drive and Microsoft. Needs no sign-in. A webhook request proves itself with the workflow's secret or signature. Must be reachable from the internet for webhooks and push. See [Background work](/self-hosting/configure/background-work#webhooks-and-push). |
| `/api/connections/google/callback`    | Browser | The Google redirect URI.                                                                                                                                                                                                                                                                                                                                     |
| `/api/connections/microsoft/callback` | Browser | The Microsoft redirect URI.                                                                                                                                                                                                                                                                                                                                  |
| `/api/connections/zoho/callback`      | Browser | The Zoho redirect URI.                                                                                                                                                                                                                                                                                                                                       |

See [Health checks](/self-hosting/operate/health-checks) and [Background work](/self-hosting/configure/background-work).

## Images

Every release publishes these images to `ghcr.io/trymetis/metis`, beside rolling `latest` tags:

| Tag                   | What it is                                         |
| --------------------- | -------------------------------------------------- |
| `<version>`           | The app                                            |
| `<version>-preflight` | The check that runs before the app on every deploy |
| `<version>-worker`    | The background worker, for the `bullmq` runner     |
| `<version>-updater`   | The updater                                        |
