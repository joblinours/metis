# Metis Suite desktop

An Electron window onto your own Metis instance. It bundles nothing of Metis: sign-in and account connections happen in your system browser and come back through `metis-suite://` deep links. AGENTS.md §4.12 describes the protocol.

```sh
bun install     # from the repository root
cd apps/desktop
bun run start   # compile and launch
bun run dist    # package into release/ (dmg, nsis, deb + AppImage)
```

`bun run build:desktop` from the repository root does the same as `bun run dist` here.

Install the `.deb` on Ubuntu 24.04 and later: `sudo apt install ./release/metis-suite-desktop_<version>_amd64.deb`. Its install script adds an AppArmor profile that lets the Chromium sandbox create user namespaces, the same thing Chrome's package does. An AppImage cannot install one, so on those releases it stops at the sandbox check.

The instance must be reachable over `https://`, except on `localhost` during development.

The shell's own screens (loading, setup, sign-in, offline and settings) are a small React app in `renderer/`, built by Vite into `dist/renderer/` and opened with `loadFile`. They use the shared shadcn components and theme from `packages/ui`, whose neutral default palette is the shell's palette; DM Sans and DM Mono come from `@fontsource`.

On Linux the `metis-suite://` scheme only resolves once a `.desktop` file declares it, which the installed `.deb` does. Under `bun run start` the browser cannot hand the sign-in back to the app.

Under `bun run start` on those Ubuntu releases, Electron's unpackaged `chrome-sandbox` is neither root-owned nor covered by a profile. Chromium's documented options are in its [AppArmor userns guide](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
