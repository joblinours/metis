# Changelog

Notable changes to the Metis Suite mobile app, released under `mobile-v<version>` tags. The server has its own [changelog](../../CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

## 0.1.1 - 2026-10-28

### Added

- Android tells you when a new version is out, once per version, and Settings → About shows an Updates row with a Download button. Turn it off with "Check for updates" in General; the check asks downloads.trymetis.email, never your server.
- When opening the server takes too long, the loading screen offers Try again, Use a different server and Settings.
- Pull to refresh on iOS.
- The setup screen accepts an address without `https://`, such as `mail.example.com`.

### Changed

- A link that opens a new window on your server opens in a page over the app, with a close button, instead of replacing the page you were on.

### Fixed

- Android's back button closes Settings instead of going back in the page behind it.

## 0.1.0 - 2026-10-24

Initial public release.
