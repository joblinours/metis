---
title: Phishing detection
description: Turn on phishing detection by pointing Metis Suite at a phishing detection backend.
---

Phishing detection checks messages for phishing and shows the verdict as a badge. People can also ask the assistant to check a message. It is off on a new instance. It needs a separate phishing detection backend running where your instance can reach it.

## Turn it on

1. Open **Dashboard**, **System**, **Phishing detection** under **Drivers**.
2. Set **Driver** to `metis`.
3. Enter the **Backend URL**: the address of your phishing detection backend.
4. Click **Save changes** and enter your authenticator code.
5. In the **Health** card, click **Run check**. It calls the backend's `/health` endpoint.

To set the starting value before the first start, use:

```bash
METIS_PHISHING_DETECTION_DRIVER=metis
BACKEND_URL=https://phishing.example.com
```

## What it sends

Metis Suite sends the raw message to the backend for a verdict. Run the backend somewhere you trust with your users' mail.

## Turn it off

Set **Driver** to `disabled` and save. While it is off, the phishing badge, the assistant's phishing tool and the matching MCP tool are hidden.
