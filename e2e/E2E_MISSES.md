# What e2e does not cover

The e2e stack is a seeded environment that two suites drive: Vitest in `api/` for everything without a browser and Playwright in `tests/` for the UI (`README.md` → Running the tests). This file lists what the stack itself lacks, from cheapest to hardest to add.

## 1. Seeds still missing

`generate` seeds one account (with 2FA), its personal workspace with the `blue` brand, the connections, a `Clients` custom label, `Rebrand` pins on the S3 and WebDAV drives, a `rebrand/` root restriction on the FTP drive, seven workflows (manual, schedule, new mail, merge append, merge join, Ask/Branch, and the disabled new-mail Ask/Branch), a scheduled send, a second account in no shared workspace, and manually added MCP clients with signed access tokens. `generate:record` adds `seed-record.sql`: the real `ai_usage` rows, one run of each manual and schedule workflow, a muted thread and a read-later message. Still missing:

- **Snooze:** snoozing archives the message on the IMAP server. A snooze made while recording would leave that server archived, but each `bun run up` starts from a fresh mailbox, so the seeded snooze would point at a message that is still in the inbox.
- **New-mail workflow runs:** the recorder starts runs by hand, and only manual and schedule triggers can be started that way; a new-mail trigger only runs when mail arrives.
- **Stored labels and cached summaries:** dumping the recorder's rows would make e2e show labels and summaries without ever sending `classify` or summary requests, so they are deliberately left to happen live.
- **Usage coverage:** the recorder only produces rows for the paths that record usage in domain code (the decision classifier, the summary gate, summaries). Chats, smart replies and the LLM classifier record usage in their routes, which the recorder bypasses. Every seeded row carries the recording date.
- **Second calendar visibility setting:** needs a second calendar connection or a second workspace.
- **Workspace logo:** needs an image file.
- **One-click and `mailto` unsubscribes:** the seeded Shop Weekly newsletter offers both, but nothing performs them; the `unsubscribe` case appends its own link-only message over IMAP and removes it.

## 2. Small infrastructure

- **More recordings:** other folders and later inbox pages (the recorder reads the first 100 inbox messages).
- **PUT-only S3 bucket:** a second bucket with a different CORS rule and its server entry.
- **Video and HEIC previews:** committed binaries or an encoder.
- **System mail flows beyond invites and sign-in alerts:** the mailer chain sends workspace invites under each driver and sign-in alerts under `console`; magic links, password resets and verification mail under `smtp` would read the same `system` mailbox.
- **A failed scheduled send:** every send reaches Postfix, so `retryScheduled` is covered only for a send with no run yet; resuming a failed send needs an SMTP that refuses on demand.

## 3. Not trivial

- **Summaries with the gate off:** the stack runs with `METIS_DECISION_SUMMARY_GATE=true`. Recording them is one more scenario in `apps/web/scripts/e2e/record/catalog.ts` with `env: { METIS_DECISION_SUMMARY_GATE: "false" }`, but replaying them needs a fixture variant (below).
- **Phishing detection:** the backend lives in another repository and has no image here, so `analyzePhishing` is the one MCP tool without a case (`UNCOVERED` in `api/mcp/tools.test.ts`).
- **The real updater:** the stack's `updater` service is a fake that speaks the protocol (`README.md` → Updater), so the Go updater, real image pulls, preflight runs, database snapshots and their restore, container switches and the app restarting under an upgrade are not covered. Covering them needs the Docker socket, a registry the host's daemon can reach and its own install directory with a `compose.yml` and `.env`.
- **A failing undo:** the fake updater's undo always succeeds, so the "needs attention" state of an undo is not covered.
- **Migrations against a real database:** e2e databases are built from `drizzle-kit export`, so preflight's migration runner runs only in `db:check` (an empty database) and on deploys.
- **Updates hidden without a socket:** the app always runs with `METIS_UPDATER_SOCKET` set, so the hidden nav entry and the 404 page need a second app configuration.
- **Fixture variants:** structured outputs off, summary vision on, and the `openai` decision driver each need their own fixture and recordings.
- **`/setup`:** needs a stack started without `seed.sql`.
- **Real providers:** Gmail, Microsoft and Zoho mail; Google, Microsoft and Zoho calendars; Google Drive and OneDrive. This includes workspace search's Gmail, KQL and Zoho dialects and Google Drive's `q`; the stack reaches only the IMAP and gateway dialects and the text-only drives and calendars.
- **Real delivery through the gateways:** `wrangler dev` logs `send_email` and the fake Resend API records `POST /emails`, so the suite checks what was handed over, not a delivered message. The fake implements only the Resend endpoints the app and the gateway call (`README.md` → Resend gateway).
- **The LLM and decision drivers other than the replayed ones:** `openai`, `anthropic` and `disabled` for the LLM, `openai` and `disabled` for the decision model; each needs its own fixture and recordings (above).
- **The `turso` database driver:** it needs Turso's hosted service.
- **The `metis` phishing driver:** see phishing detection above.
- **Other apps:** the desktop shell, the mobile shell and the marketing site.

## 4. Inherent to replay

- Chats replay only their scripted turns; any other message misses.
- Changing a label, a prompt, an agent's instructions or a summary card changes the request, so the recording no longer matches until `generate:record` runs again.
- With `METIS_DECISION_CLASSIFIER=true` the LLM classifier recordings are kept but never sent.
