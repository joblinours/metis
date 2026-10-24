# App downloads

Where the desktop and Android apps are published, and the exact URL of every file: `https://downloads.trymetis.email`, a public Cloudflare R2 bucket.
Paths are from the repository root.
See also [AGENTS.md](../AGENTS.md), [desktop.md](desktop.md), [mobile.md](mobile.md), [deployment.md](deployment.md), [self-host.md](self-host.md), [www.md](www.md).

## Code map

| Concern                                                                      | Where                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Desktop packaging (product name, app id, protocol; targets for local builds) | `apps/desktop/package.json` → `build`                                                           |
| Building, signing and uploading the desktop files (published targets)        | `.github/workflows/desktop.yml` → jobs `release`, `build`, `publish`                            |
| Building, signing and uploading the APK                                      | `.github/workflows/mobile.yml` → jobs `release`, `build`, `publish`                             |
| Checking the tag against the app version                                     | `.github/scripts/release-version.sh`                                                            |
| Writing one release into the bucket                                          | `.github/scripts/r2-upload.sh`                                                                  |
| Android app id and version                                                   | `apps/mobile/app.json` → `expo.android.package`, `expo.version`                                 |
| Links on the marketing site                                                  | `apps/www/src/content/downloads.ts` → `DOWNLOADS`, rendered by `apps/www/src/app/apps/page.tsx` |
| Links in the customer docs                                                   | `apps/docs/content/guide/09-apps/` (the download page)                                          |

## Files

The desktop app and the mobile app are released separately, each with its own version: a desktop release publishes the eight desktop files below and a mobile release the APK. The name is `metis-suite-<target>.<ext>`, where `<target>` is the target triple of the CPU and OS it runs on; Android is one universal APK.

| Platform                               | CPU                                  | Target                      | Format         | File                                        |
| -------------------------------------- | ------------------------------------ | --------------------------- | -------------- | ------------------------------------------- |
| macOS                                  | Apple silicon                        | `aarch64-apple-darwin`      | Disk image     | `metis-suite-aarch64-apple-darwin.dmg`      |
| macOS                                  | Intel                                | `x86_64-apple-darwin`       | Disk image     | `metis-suite-x86_64-apple-darwin.dmg`       |
| Windows                                | x64                                  | `x86_64-pc-windows-msvc`    | NSIS installer | `metis-suite-x86_64-pc-windows-msvc.exe`    |
| Windows                                | Arm                                  | `aarch64-pc-windows-msvc`   | NSIS installer | `metis-suite-aarch64-pc-windows-msvc.exe`   |
| Debian, Ubuntu and derivatives         | x64                                  | `x86_64-unknown-linux-gnu`  | `.deb`         | `metis-suite-x86_64-unknown-linux-gnu.deb`  |
| Debian, Ubuntu and derivatives         | Arm64                                | `aarch64-unknown-linux-gnu` | `.deb`         | `metis-suite-aarch64-unknown-linux-gnu.deb` |
| Fedora, RHEL, openSUSE and derivatives | x64                                  | `x86_64-unknown-linux-gnu`  | `.rpm`         | `metis-suite-x86_64-unknown-linux-gnu.rpm`  |
| Fedora, RHEL, openSUSE and derivatives | Arm64                                | `aarch64-unknown-linux-gnu` | `.rpm`         | `metis-suite-aarch64-unknown-linux-gnu.rpm` |
| Android                                | Any (arm64-v8a, armeabi-v7a, x86_64) | `universal-linux-android`   | APK            | `metis-suite-universal-linux-android.apk`   |

Beside each app's files, its own `SHA256SUMS` lists the SHA-256 of each of them in `sha256sum` format, so `sha256sum -c --ignore-missing SHA256SUMS` checks a download.

## URLs

`<app>` is `desktop` or `mobile`, and `<version>` is that app's version.

| Folder      | URL                                                        | Holds                                              |
| ----------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Latest      | `https://downloads.trymetis.email/<app>/latest/<file>`     | The app's newest release that is not a pre-release |
| One release | `https://downloads.trymetis.email/<app>/v<version>/<file>` | That release, never changed after it is published  |

So the Apple silicon build is `https://downloads.trymetis.email/desktop/latest/metis-suite-aarch64-apple-darwin.dmg`, and its checksums are `https://downloads.trymetis.email/desktop/latest/SHA256SUMS`.

## Rules

- **Links point at `<app>/latest/`; file names never carry the version.**
  - A link written once stays right for every release.
  - `v<version>/` exists for pinning and rollback; nothing on the site or in the docs links it.
- **One build serves every instance.** The apps hold no server address: on first launch they ask for one and sign in through the browser ([desktop.md](desktop.md)).
- **Each app has its own version and its own release tag.**
  - A GitHub release tagged `desktop-v<version>` releases the desktop app; `mobile-v<version>` the mobile app.
  - `<version>` must equal `apps/desktop/package.json` → `version` or `apps/mobile/app.json` → `expo.version`; the `release` job fails the run before building otherwise.
  - Neither is tied to the server's version ([deployment.md](deployment.md)).
- **A pre-release writes only `<app>/v<version>/`.** The links keep serving the last full release, and a tester gets the pre-release from its version folder.
- **A release writes `<app>/v<version>/` in full, `SHA256SUMS` last, before it touches `<app>/latest/`, and writes `<app>/latest/SHA256SUMS` last.** R2 has no atomic folder swap; this order means `latest/` never lists a checksum for a file that is not there yet.
- **A release whose `<app>/v<version>/SHA256SUMS` exists is never uploaded again**; `publish` fails instead. A run that failed partway through that folder can be re-run, because `SHA256SUMS` is written last.
- **Each app's folder has one workflow writing it**: `desktop/` from `desktop.yml`, `mobile/` from `mobile.yml`.
- **The nine files and their names are fixed.** Adding or renaming one changes, together: this table, the file lists in `desktop.yml` / `mobile.yml`, `apps/www/src/content/downloads.ts` and the docs download page.
- **Linux ships as `.deb` and `.rpm` packages.**
  - The `.deb` installs the AppArmor profile Ubuntu 24.04+ needs for Electron's sandbox.
  - Both packages install the `.desktop` file that registers `metis-suite://`, without which browser sign-in cannot return to the app ([desktop.md](desktop.md)).
- **Each desktop platform is signed only when its repository variable is `true`: `SIGN_MACOS` (Developer ID and notarization) and `SIGN_WINDOWS` (code signing).**
  - With the flag `true`, the run passes `forceCodeSigning`, so a missing or broken certificate fails the build.
  - Unset or any other value builds unsigned: macOS keeps the ad-hoc identity `mac.identity: "-"` from `apps/desktop/package.json`, and Gatekeeper and SmartScreen block the first launch until the user allows it.
  - The switch is an explicit flag rather than the certificate secret's presence, so a deleted or misnamed secret fails the release instead of shipping it unsigned.
- **The APK is always signed, with a release key that stays the same across versions**, so Android installs a new APK over the old one and keeps its data. A different key forces an uninstall, so the first release's key is permanent.
- **The bucket has its own write keys (`DOWNLOADS_R2_ACCESS_KEY_ID`, `DOWNLOADS_R2_SECRET_ACCESS_KEY`, `DOWNLOADS_R2_BUCKET`)**, separate from the server's scripts bucket ([self-host.md](self-host.md)); only `R2_ACCOUNT_ID` is shared.

## How it works

- **Only a published GitHub release uploads.** `desktop.yml` and `mobile.yml` run on `release: published`, and each one's `release` job runs only when the tag carries its prefix (`docker.yml` does the same for `app-v`).
  - A run by hand (`workflow_dispatch`) builds and leaves the files as workflow artifacts; its `publish` job is skipped.
- **Each workflow has three jobs: `release`, `build`, `publish`.**
  - `release` runs `release-version.sh`, which checks the tag and outputs `version` and `latest` (`false` for a pre-release).
  - `build` uploads each target's files as a `<app>-<target>` artifact.
  - `publish` merges the `<app>-*` artifacts and runs `r2-upload.sh` with the version folder, the latest folder and the file list.
- **`r2-upload.sh` holds the write order, the overwrite refusal and the cache headers once**, for both apps and the server's scripts bucket ([self-host.md](self-host.md)).
  - It reads the bucket and its keys from the environment, so each caller passes its own bucket's secrets.
  - Files under `v<version>/` are cached as immutable; latest files for five minutes, so a new release shows up quickly without a stale `SHA256SUMS`.
- **The published desktop targets come from `desktop.yml`'s build matrix.**
  - Each entry passes its target triple as `-c.artifactName` and its packages on the command line (`--linux deb rpm`, `--win nsis`, `--mac dmg`).
  - One CPU per run, so NSIS never builds a combined two-CPU installer.
- **`desktop.yml`'s `Package` step reads the signing flag of its runner's OS**; Linux packages are never signed.
  - An unsigned run unsets every signing variable, because a missing secret arrives as an empty string and electron-builder must not try to sign or notarize with it.
- **macOS signing overrides `mac.identity: "-"` with the team ID** (`-c.mac.identity`).
  - electron-builder matches it against the Developer ID certificate imported from `CSC_LINK`.
  - Notarization follows from `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **The APK is re-signed after Gradle.** `expo prebuild` generates a release build type signed with the debug key; `apksigner` replaces that signature with the release key. Gradle builds only the three ABIs in the table (`reactNativeArchitectures`).

## Deliberate limits

- **No iPhone or iPad download.** iOS installs only from the App Store or TestFlight.
- **No auto-update.** A new version is a new download over the old install.
- **One disk image per CPU on macOS**, because each is smaller than one universal image holding both.
