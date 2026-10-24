---
title: Health checks
description: The two endpoints your uptime monitor or load balancer can use to check the instance.
---

Metis Suite has two health endpoints for uptime monitors and load balancers. Both answer with a status code only, with no body, and need no sign-in.

| Endpoint      | Answers `200` when                                           | Otherwise |
| ------------- | ------------------------------------------------------------ | --------- |
| `/api/livez`  | The app process is serving requests. It checks nothing else. | No answer |
| `/api/readyz` | The settings loaded and both databases answer.               | `503`     |

For example:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" https://mail.example.com/api/readyz
```

Use `/api/livez` to decide whether to restart the app, and `/api/readyz` to decide whether to send it traffic. The updater also waits for `/api/readyz` after an upgrade.

When `/api/readyz` answers `503`, the reason is written only to the app's log, never to the response:

```bash
sudo docker compose --project-directory /opt/metis-suite logs app
```

## Checks inside the dashboard

The owner dashboard has deeper checks that contact each service: the **Health** card on every driver and provider page under **System**. The card runs its checks when you click **Run check**. Saving a change also checks the changed settings. Every deploy checks your servers and the LLM. It also checks the decision model when one of the decision model's switches is on. Problems appear on the **Deploy checks** page. See [Troubleshooting](/self-hosting/operate/troubleshooting#read-the-deploy-checks) and [Owner dashboard](/self-hosting/operate/owner-dashboard#health-checks-on-driver-and-provider-pages).
