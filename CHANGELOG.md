# Changelog

Notable changes to the Metis Suite server: the app, worker, preflight and updater images, `compose.yml` and `bootstrap.sh`, released together under `app-v<version>` tags. The desktop and mobile apps have their own changelogs in [`apps/desktop/`](apps/desktop/CHANGELOG.md) and [`apps/mobile/`](apps/mobile/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

### Upgrade notes

- Reconnect Zoho accounts to use their tags as labels (new permission `ZohoMail.tags.ALL`), and Outlook accounts to use their categories (new permission `MailboxSettings.ReadWrite`). Folders work without reconnecting.

### Added

- Mail: rename and delete folders and labels from the sidebar, at the provider.
- Workspace AI and MCP: the label tools now work on the account's own labels (Gmail labels, Zoho tags, Outlook categories), plus `renameLabel`, `renameMailFolder`, `moveMailFolder` and `deleteMailFolder`. None of them needs to be turned on first.
- Workspace AI and MCP: `getAttachment` shows an attachment, images as images and Word, Excel, PDF and text files as their content; drafts, sends and scheduled sends take attachments, from another email or written by the assistant.
- Mail: Word (.docx) and Excel (.xlsx) attachments are read by the assistant and in thread summaries.
- Mail: each account's own folders, sub-folders and labels in the sidebar (Gmail labels, Zoho folders and tags, Outlook folders and categories), with one group per account in All inboxes. Opening one lists its emails.
- Mail: Move to a folder and add or remove labels from an email, by menu, by dragging an email onto a folder, or with `m o` and `m l`. Changes are made at the provider, so they show in Gmail, Zoho Mail and Outlook.
- Mail: create folders, sub-folders and labels at the provider from the sidebar.
- Workspace AI and MCP: `listMailFolders`, `listEmailsInFolder`, `moveToFolder`, `applyProviderLabels` and `createMailFolder` (off by default for MCP clients).

### Changed

- Mail: Metis's own labels (Work, Newsletter, custom labels, AI sorting) are gone from the app and from MCP; only the account's own labels remain. The inbox tabs are All, Unread and Starred. Existing workflows that use the Label step or the label triggers keep running, but these are no longer offered, and the "Label mail from a sender" template is now "Star mail from a sender".
- Mail: Outlook drafts keep the attachments given on update, and Zoho drafts keep their attachments.
- Workspace AI and MCP: `getAttachment` reads a PDF page by page and shows scanned pages as images; attachments may total 25 MB.

- Mail: mailboxes open much faster. Gmail reads at most 10 messages at a time instead of a whole page at once, the first page holds 50 messages, and the unified inbox asks each account for its share of a page instead of a full page each.
- Mail: opening and closing a message no longer reloads the list or asks the AI to label the same messages again.
- Mail: marking many Gmail or Outlook messages read or unread is one request per batch instead of one per message.
- Zoho: a new sign-in token tries the data center that answered last first, then the one set under Dashboard → Zoho.

### Fixed

- Gmail: an attachment's id stays the same between reads, so the assistant can open it and attach it to a draft.
- Gmail and Outlook: drafts and sends with attachments over a few MB no longer fail.
- Zoho: attached files are uploaded as the file itself.
- A slow or unreachable account no longer holds the unified inbox: after 20 seconds it shows as unavailable and the others load.
- Fewer "Internal Server Error" pages: requests that refresh an account's sign-in at the same moment share one refresh, and token refreshes time out after 10 seconds.
- Pages that fail to load show a message and a Try again button, and opening a folder shows a placeholder right away.
- A failed star or mark as read is undone in the list, with a message, instead of silently drifting from the account.
- Clicks on a message that move the pointer slightly no longer start a drag.
- When the AI model stops answering, smart replies, summaries and labels stop calling it for 5 minutes instead of retrying on every message.
- Thread summaries and smart replies follow the workspace AI switch.

## 0.2.0 - 2026-10-28

### Upgrade notes

- Run `bootstrap.sh` again before you upgrade from the dashboard. Only bootstrap updates the updater, and this release's updater reads each release's notes from `sh.trymetis.email`.
- Contains a database migration that rebuilds the workflow tables for the new workflow engine. Undo last upgrade restores the database from before it; installs on Turso or an external sqld should back up first.
- The upgrade moves every workflow to the new workflow engine. Rules become steps with expressions, so each workflow keeps doing what it did. A workflow that cannot be moved is turned off, and the editor says why.
- Runs from before the upgrade stay in the run history but cannot be retried. Runs that were queued or running when you upgraded are marked failed; run those workflows again.
- Scheduled sends and snoozes carry over and still go out or come back at their time. One that came due during the upgrade goes out or comes back right after it.
- To get changes from Microsoft and from Google calendars and drives pushed to your instance instead of checked every few minutes, set **Public URL for webhooks and push** under Dashboard → System → Workflow runner. Gmail mailboxes are always checked every few minutes.

### Added

- Workflows: triggers for calendar events (created, updated, cancelled, invitations, answers, starting soon, ended), files added or changed in a drive folder, mail sent, starred or labelled, webhooks, being called by another workflow, and app events (a run failed, phishing found, an AI label applied, a member joined).
- Workflows: calendar steps (list, get, create, update, delete, answer, find free time, add an invitation file) and drive steps (list, search, read text, write, create folders, move, rename, copy, delete, save an attachment or a whole message).
- Workflows: waits and people in the loop. Delay, wait until a time, wait for a reply, answer or file, ask members to approve, call another workflow, and return a result.
- Workflows: Loop and End loop repeat the steps between them for each entry of a list and collect what each gives back.
- Workflows: AI steps that write, extract fields, summarize, sort into categories, and an agent that reads your mail, calendar and drive to answer a task. The agent can only read.
- Workflows: expressions for any setting, with type checks as you type, If, Switch, Filter, Split, Aggregate and Set steps, and a choice of what happens when a step fails.
- Workflows: conditions can be built as rows of a field, a comparison and a value, in groups that match all or any, and switched to an expression and back.
- Workflows: run limits per workflow (how many at once, and at most once per period or after a quiet spell), and a time zone that dates in expressions, new events and the agent use.
- Workflows: a Revisions panel in the editor that shows what each save changed, and what you changed since the last save.
- Workflows: a step that sends, creates an event, answers an invitation or writes a file and never got a reply from the provider can be resolved from the run history: confirm it from what the provider shows, or close it without retrying.
- Workflows: test runs on a recent item, a pinned sample, a pasted event or typed inputs; replaying a past run, from any step; and each step's input and output in the editor and the run history.
- Workflows: a list of the approvals waiting for you, with approve and deny in the run history and the Runs panel.
- Dashboard (System → Workflow runner): how long workflow step data and run history are kept, the public URL for webhooks and push, and trusted proxies.
- Workspace AI and MCP: `listWorkflowSteps` lists every workflow step and its settings, and `applyWorkflows` takes the inputs a manual run declares.

### Changed

- Workflows: every template is new, and the data export lists the calendars and drives each workflow uses beside its mailboxes.
- Workflows: step data is kept 7 days and run history 90 days by default, and a daily maintenance workflow removes what is older.
- Workflows: new mail in Gmail, Outlook and IMAP folders is picked up from the provider's change history, and Google and Microsoft calendars and drives are re-read only when they changed.
- Snooze: a message snoozed from the archive or the trash goes back there when it wakes, not to the inbox.
- Updates: the updater reads each release's notes from `sh.trymetis.email` instead of GitHub, so the Updates page needs no access to `api.github.com`.

### Fixed

- Gmail: moving a message back to the inbox from the archive or spam, and a snoozed message waking up, put it back in the inbox.

## 0.1.2 - 2026-10-27

### Changed

- Navigation on phones: Mail, Calendar, Drive, Workflows, Workspace AI, Settings, Workspace settings and the Dashboard open their side menu from a button in the page's own title bar.
- Page headers: each page's action button sits beside its title, with the description underneath.

### Fixed

- Mail on phones: the message toolbar, Compose, search, summary cards and the Scheduled and Subscriptions views fit the screen.
- Calendar: event fields have room on both sides, and Schedule view dates stay readable on every screen.
- Drive on phones: file names get the width of the row.
- Workflows: the run history, run details and editor fit phones, and the Runs panel opens when you tap its tab.
- Settings and the Dashboard on phones: forms, menus, headers and wide tables fit the screen, and the section bar stays at the top.
- Text fields on touch devices: normal-sized text, without iPhones zooming in when a field is tapped.
- Styling: hover hints no longer stick on touch screens, and **Sign out** and **Add client** match the rest of the app.

## 0.1.1 - 2026-10-26

### Upgrade notes

- Run `bootstrap.sh` again before your next upgrade from the dashboard. Only bootstrap updates the updater, and this release's updater is the one that snapshots the database and can undo an upgrade.
- Preflight now applies database migrations. An existing database is recorded as already at the baseline the first time preflight runs; nothing else changes in it.
- `METIS_INIT_SQL` is gone. A database with no schema gets it from the migrations the preflight image ships.

### Added

- Database migrations, applied in order by preflight on every deploy and upgrade. Preflight refuses a database that a newer release already migrated.
- Before an upgrade, the updater stops the app and snapshots the stack's sqld database. If the upgrade fails, it restores the snapshot and switches back.
- **Undo last upgrade** on Dashboard → Updates returns to the previous release and its database snapshot, once. It needs your authenticator code and is recorded in the audit log. Scheduled work that ran after the upgrade is due again in the restored database: a scheduled message sent since then is sent a second time.
- Release notes for each newer release on Dashboard → Updates.
- The workflow builder is a palette, canvas and inspector editor with summary cards, live validation, undo, step names and skip. Runs show on the canvas, a test run has no side effects, and the run history sits on the same card.
- Search and filters on the audit log pages.
- Workspace owners and admins reach the workspace's **Activity** from the workspace menu and from the search dialog.
- A failed mail list shows an error with a retry button.

### Changed

- Dashboard → Updates offers only releases newer than the one running. Downgrading to an older release is no longer possible; use Undo last upgrade instead.
- Mail, calendar and drive requests are rate-limited per user.
- The company address in the footer of emails Metis Suite sends is updated.

### Fixed

- The built-in maintenance workflows (pruning MCP clients and audit events) are set up one after the other instead of both at once.
- The scheduled-send badge refreshes only when a send is due.

## 0.1.0 - 2026-10-24

Initial public release.
