# Changelog

Notable changes to the Metis Suite server: the app, worker, preflight and updater images, `compose.yml` and `bootstrap.sh`, released together under `app-v<version>` tags. The desktop and mobile apps have their own changelogs in [`apps/desktop/`](apps/desktop/CHANGELOG.md) and [`apps/mobile/`](apps/mobile/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). While the major version is 0, any release may change behavior. Releases install forward only; **Upgrade notes** say what an operator does beyond clicking Upgrade.

## Unreleased

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
