# Desktop shell — Electron over the user's own instance

The Electron window onto a running Metis server: its own pages, the `native` sign-in protocol and connection tickets the mobile shell shares, downloads, settings, connectivity and packaged-build lockdown.
Paths without a workspace prefix are in `apps/desktop/`; web paths are written in full.
See also [AGENTS.md](../AGENTS.md), [mobile.md](mobile.md), [auth.md](auth.md), [connections.md](connections.md), [downloads.md](downloads.md), [ui.md](ui.md).

## Code map

| Concern                               | Where                                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main process                          | `src/main.ts` → `route`, `openSettings`, `reconnectOrRefresh`, `fromLocalPage`                                                                                                                                 |
| Navigation rules                      | `src/navigation.ts` → `attachNavigation`, `SIGN_IN_PATHS`, `BROWSER_ONLY_PREFIXES`                                                                                                                             |
| Login, session, tickets               | `src/auth.ts` → `beginLogin`, `connectTicketUrl` · `src/http.ts` → `requestJson`                                                                                                                               |
| Deep links and constants              | `src/links.ts` → `SCHEME`, `USER_AGENT_TOKEN`, `SETTINGS_PATH`, `parseDeepLink`                                                                                                                                |
| Stored state (`userData/config.json`) | `src/store.ts` → `readServer`                                                                                                                                                                                  |
| Settings                              | `src/settings-types.ts` → `Settings` · `src/settings.ts` → `readSettings`, `writeSettings` · `src/tray.ts`, `src/autostart.ts`                                                                                 |
| Preload                               | `src/preload.ts` (`contextBridge.exposeInMainWorld("metis", …)`, typed `MetisBridge`)                                                                                                                          |
| Downloads                             | `src/downloads.ts` → `handleDownloads`                                                                                                                                                                         |
| Step log                              | `src/log.ts` → `log`                                                                                                                                                                                           |
| Renderer pages                        | `renderer/*.html` → `renderer/src/pages/*.tsx` · shared page frame `renderer/src/screen.tsx` → `Screen`, `useServer` · `renderer/src/mount.tsx` · `renderer/src/styles.css` · `vite.config.mts`                |
| Packaging                             | `package.json` → `build.electronFuses`, `desktopName` · icons `static/icon.png`, `icons/` ([ui.md](ui.md))                                                                                                     |
| Web: native plugin                    | `apps/web/src/auth/native.ts` → `native`                                                                                                                                                                       |
| Web: ticket consumption               | `apps/web/src/auth/native-ticket.ts` → `consumeNativeConnectTicket` · `apps/web/src/app/api/connections/start/[provider]/[resource]/route.ts`, `apps/web/src/app/api/connections/[provider]/callback/route.ts` |
| Web: link builders                    | `apps/web/src/auth/native-link.ts` → `NATIVE_SCHEME`, `NATIVE_USER_AGENT_TOKEN`, `isNativeUserAgent`                                                                                                           |
| Web: browser pages                    | `apps/web/src/app/(auth)/native/{login,return,settings}/`                                                                                                                                                      |
| Web: "App settings" menu item         | `apps/web/src/components/app-rail.tsx`                                                                                                                                                                         |

## Rules

### Isolation

- **The shell is a window onto a running server and bundles nothing of Metis.** The first run asks for the instance address and checks it against `/api/auth/ok`; from then on the window loads that origin.
- **The remote page gets `contextIsolation`, `sandbox` and no Node integration.** Its preload only forwards the OS's `online` / `offline` events to the main process.
- **Only the shell's own `file:` pages get the `window.metis` bridge, and every IPC handler re-checks that the sender is a `file:` frame** (`fromLocalPage`).
- **The shell's own pages stay `file:` pages**: Vite builds them with `base: "./"` into `dist/renderer/` and `main.ts` opens them with `loadFile`, which keeps the `file:` checks true. Each page's CSP meta tag allows only `'self'`.
- **Every control on a shell page is a shadcn primitive from `packages/ui`**; the pages use `@metis/ui`'s neutral tokens and `@fontsource` fonts ([ui.md](ui.md)).
- **`src/settings-types.ts` has no imports**, so the main process, the preload (`satisfies MetisBridge`) and the renderer share one definition.

### Sign-in and the native protocol

- **Sign-in and provider OAuth happen in the system browser.** Google refuses OAuth in embedded webviews, and a password typed into the shell would be a second sign-in surface.
  - When the shell is about to show a sign-in page (`SIGN_IN_PATHS`; `will-navigate`, `will-redirect`, `did-navigate-in-page`), it shows its local "Sign in with browser" screen instead.
  - Paths under `BROWSER_ONLY_PREFIXES` open in the browser; `/native/settings` is checked first and opens the shell's settings.
- **The deep link carries only a code useless without the verifier, which stays in the shell**, because on Windows and Linux any app can register the same scheme.
- **The login confirm page always asks the user to confirm**, so a local app cannot silently take a session.
- **The exchange creates a new, separate session in the shell's own `persist:metis-suite` partition**, so signing out in the browser does not sign the app out.
- **Only the browser that started a connection can finish it.** The callback trusts the ticket's user only together with that browser's own nonce cookie ([connections.md](connections.md)).
- **Codes and tickets are single-use and race-safe**: stored in Better Auth's `verification` table under `native-login:` / `native-connect:` + sha256 of the token, and spent with `consumeVerificationValue`.
- **The web's `NATIVE_SCHEME` and `NATIVE_USER_AGENT_TOKEN` must equal `SCHEME` and `USER_AGENT_TOKEN` in both shells' `links.ts`.**
- **The routes and their copy are shell-neutral** (`native`, "the Metis app"), because the mobile shell speaks the same protocol.

### Settings and windows

- **Settings belong to the shell, and the remote page can only link to them.**
  - The "App settings" item in `app-rail.tsx` shows only when `isNativeUserAgent()` finds the `MetisSuite/<version>` token the shell adds to its user agent.
  - The item is a plain `<a href="/native/settings">`, because a Next `<Link>`'s `pushState` reaches no shell; `navigation.ts` turns it into `openSettings()`.
  - Opened in a normal browser, `/native/settings` says to use the app.
- **Settings validate key by key** (`src/settings.ts` → `settingsFrom`, a zod schema whose every field `.catch`es to the current value), so a bad or old `config.json` or IPC patch falls back per key.
  - `src/store.ts` parses `config.json` the same way: a malformed `server`, `pendingLogin` or `lastPath` reads as absent.
- **Shell pages use the shell's neutral black and white and follow the system theme** (`renderer/src/mount.tsx`).
- **Both windows take their background color from `nativeTheme` and update it when the system theme changes**, so a load never flashes the other color.
- **Every server load goes through the loading page first**, so a deep link always changes what the window shows.
  - A load replaced by another, or by the shell's own sign-in interception (`ERR_ABORTED`), is expected and only logged.
  - Any other failure surfaces on the sign-in screen.
- **Google downloads go to the system browser**, because `webContentLink` needs the viewer's Google browser session (`needsBrowserSession`).

### Packaged builds

- **A package the main process imports at runtime goes in `dependencies`, not `devDependencies`.**
  - `tsc` compiles `src/` to `dist/` without bundling, so `dist/main.js` `require`s it, and electron-builder packs only `dependencies` (its bun collector walks `node_modules`).
  - The renderer is bundled by Vite, so its packages stay in `devDependencies`.

- **DevTools and debuggers exist only when `!app.isPackaged`.** A packaged build:
  - leaves Toggle Developer Tools out of the View menu;
  - gives every window (main, popups, Settings) `webPreferences.devTools: false`, so `openDevTools()` cannot open them;
  - removes `remote-debugging-port` and `remote-debugging-pipe` with `app.commandLine.removeSwitch()` before `ready`, since no fuse covers them (check: launch it with `--remote-debugging-port=9333`; `127.0.0.1:9333/json` must not answer);
  - sets `build.electronFuses` to turn off `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments`, and to turn on `enableCookieEncryption`, so the session cookie on disk is sealed with the OS keychain.
- **The step log records page loads by origin and path only** (`urlPath`), so codes, states, verifiers and cookies never reach it.
- **Sign-out is best effort**: the shell clears its own cookies even when the server is unreachable.
- **On Ubuntu 24.04+ Electron's sandbox needs the AppArmor profile the `.deb` installs** (electron-builder's built-in `after-install.tpl`). The kernel there restricts unprivileged user namespaces unless a profile allows them; an AppImage cannot install one, so its sandbox aborts ([downloads.md](downloads.md)).
- **`desktopName` + `linux.syncDesktopName` keep Electron's Wayland `app_id`, the `.desktop` file name and `StartupWMClass` identical**, so the dock links the window to the entry.

## How it works

- **Login (PKCE over a deep link).**
  - The shell keeps `verifier` + `state` in `userData/config.json` for `PENDING_LOGIN_TTL_MS` (on disk, because a deep link may launch the app cold) and opens `/native/login?challenge=sha256(verifier)&state=…`.
  - `/native/login` sends a browser with no session to `/?next=…`; the sign-in page stores `next` with `rememberTwoFactorCallback` before a password sign-in, so it survives `/2fa/verify` ([auth.md](auth.md)).
  - The confirm button calls `POST /api/auth/native/code`, then goes to `/native/return?to=metis-suite://auth?code&state`.
  - The shell checks `state` and posts `{code, verifier}` to `/api/auth/native/exchange` from `persist:metis-suite`; the endpoint sets the new session's cookie there.
- **Connecting an account.**
  - The shell intercepts `/api/connections/start/*`, gets a single-use ticket bound to that pathname (`POST /api/auth/native/connect-ticket`, valid for `CONNECT_TICKET_TTL_MS`), and opens `start?…&nativeTicket=…` in the browser.
  - The start route consumes the ticket in place of a browser session and writes `nativeUserId` into the HMAC-signed OAuth state.
  - Success and every post-decode error end at `/native/return?to=metis-suite://open?path=<the destination or error path the web would use>`; errors raised before the state decodes stay on the web error page.
- **Downloads.** A top-level navigation to `/api/drive/download` that redirects to another origin goes to `downloadURL` (Electron's save dialog), except Google hosts. Every other cross-origin link, including `window.open`, opens in the system browser. `about:blank` popups (print, view original) stay in-app under the same rules.
- **Reopen where you left off.**
  - Every main-frame navigation under `/w/` on the paired server is written to `lastPath` (beside `server`, not under `settings`); start-up opens it instead of `/w` while `restoreLastPage` is on.
  - It is cleared on sign-out, server change, reset, and when the setting is turned off; a deep link and a fresh sign-in land where they point.
  - Window size, position and maximized state are Electron's `windowStatePersistence`, keyed by the window `name` (`main`, `settings`).
- **Window title.** The web page's own title ([ui.md](ui.md)), with the shell's offline suffix while offline.
- **Offline.**
  - The offline page takes over only when a load fails with a network error, or the start-up session check cannot reach the server; a drop while the app is open only marks the title.
  - The server is asked again (one `get-session`) only on an `online` event, `powerMonitor` `resume`, or "Try again", and only while the offline page is showing.
  - A stale sign-in link loads the app when the shell already holds a session.
- **Builds.** `bun run build` compiles the main process with `tsc` and the renderer with `vite build`; `typecheck` checks both projects. `bun run start` keeps DevTools, and is where the DevTools "Offline" test works.
- **Linux deep links.** `metis-suite://` resolves only once a `.desktop` file declares the scheme: the installed packages declare it, `bun run start` does not.

## Deliberate limits

- **Connectivity is event-driven and never polls the server**, because every check is a request a serverless host bills.
- **The offline page has no automatic retry**; it waits for one of the triggers above.
