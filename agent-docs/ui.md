# UI system — `@metis/ui`, shadcn, theme, shells and brand marks

How UI is built across the apps: the `packages/ui` shadcn layout, adding and styling components, theme and workspace brands, the mail shell, the source link and brand marks.
Paths are from the repository root; `src/…` means `apps/web/src/…`.
See also [AGENTS.md](../AGENTS.md), [shortcuts.md](shortcuts.md), [desktop.md](desktop.md), [mobile.md](mobile.md), [www.md](www.md).

## Code map

| Concern                            | Where                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| shadcn primitives                  | `packages/ui/src/components/` (written by `bunx shadcn@latest add`) · config `apps/web/components.json`, `packages/ui/components.json` (both pin the `utils` alias and the `@svgl` registry)                                                                                                                 |
| `cn`                               | `packages/ui/src/lib/utils.ts`                                                                                                                                                                                                                                                                               |
| Theme tokens and shadcn variables  | `packages/ui/src/styles/tokens.css` (neutral defaults, light and dark) · `packages/ui/src/styles/globals.css` (`@custom-variant dark`, shadcn variables mapped onto those tokens)                                                                                                                            |
| App CSS                            | `src/styles/globals.css` (imports `@metis/ui/globals.css`, then `brands.css`; editor, email body, preview, charts) · `apps/desktop/renderer/src/styles.css`                                                                                                                                                  |
| Light/dark                         | `src/app/_components/theme-provider.tsx` → `ThemeProvider` (next-themes) · mounted in `src/app/layout.tsx`                                                                                                                                                                                                   |
| Fonts                              | Cormorant Garamond (titles), DM Sans (UI), DM Mono (addresses): `next/font` in `src/app/layout.tsx` and `apps/www`, `@fontsource` in the desktop renderer                                                                                                                                                    |
| Workspace brand                    | palettes `src/styles/brands.css` (keyed by `data-brand`) · `src/theme/brand.ts` → `THEME_BRAND_IDS`, `DEFAULT_THEME_BRAND` · `src/theme/resolve.ts` → `resolveThemeBrand` · `src/app/_components/brand-sync.tsx` → `BrandSync` · procedure `workspaces.setThemeBrand` in `src/server/routes/workspaces.ts`   |
| Page titles                        | `src/workspace/titles.ts` · the `"%s • Metis Suite"` template in `src/app/layout.tsx` · `generateMetadata` in the mail, calendar and drive layouts                                                                                                                                                           |
| Source link (AGPL §13)             | `src/source-info.ts` → `sourceInfo` (server-only) · `src/components/source-link.tsx` → `SourceLink` · placed by `src/app/(auth)/layout.tsx`, `src/app/settings/_components/settings-sidebar.tsx`, `src/app/dashboard/_components/dashboard-sidebar.tsx` and `src/components/app-rail.tsx` → `SourceRailLink` |
| Mail shell                         | `src/app/w/[slug]/m/[mailbox]/_components/mail-shell.tsx` → `MailShell` · mounted only by `src/app/w/[slug]/m/[mailbox]/layout.tsx`                                                                                                                                                                          |
| Workspace search dialog            | `src/components/search/search-dialog.tsx` → `SearchDialog` (a `Dialog` on desktop, a full-height bottom `Sheet` on phones, [search.md](search.md))                                                                                                                                                           |
| Brand marks                        | `packages/ui/src/components/svgs/` (generated) · `packages/ui/src/components/brand-marks.tsx` → `BrandMark` and the hand-written marks · `src/components/provider-meta.tsx` → `ACCOUNT_PROVIDER_META` · raster art `apps/web/public/brand/`                                                                  |
| The app's own mark: source         | `src/app/icon.svg` · `packages/ui/src/components/metis-mark.tsx` → `MetisMark`                                                                                                                                                                                                                               |
| The app's own mark: rendered files | `src/app/favicon.ico`, `src/app/apple-icon.png`, `apps/desktop/static/icon.png`, `apps/desktop/icons/<n>x<n>.png`, `apps/mobile/assets/icon.png`, `apps/mobile/assets/adaptive-icon.png`                                                                                                                     |
| The app's own mark: drawn copies   | `apps/www/src/app/icon.svg`, `apps/www/src/components/ui/metis-mark.tsx`, the mark in `apps/www/src/app/og/[...slug]/route.tsx`, `apps/docs/public/{icon,logo}.svg`, `apps/mobile/components/metis-mark.tsx`                                                                                                 |

## Rules

### Components

- **Always shadcn.** Before writing any interactive, overlay or layout UI, check `packages/ui/src/components/`.
  - If the component is missing, install it with `bunx shadcn@latest add <name>` from the consuming app; `base-nova` makes the CLI serve Base UI ports.
  - Style state-dependent variants with `cva` + `cn` as `button.tsx` does; colors come from tokens, never `style={{}}`.
  - Use the primitive for the job: `resizable` for drag-resize, `hover-card` for hover popups, `Button` for buttons.
  - A component missing from the repo is added through the CLI.
  - A bespoke component moves to its shadcn primitive when a change touches it; there is no bulk sweep.
- **Check `git diff` after every `shadcn add`.** The CLI can overwrite shared files that already exist (such as `button.tsx`) with upstream's version.
- **Generated primitives, `_components/` imports and the `cn` import follow [AGENTS.md](../AGENTS.md) §2 and §4.**
- **`cn` is shadcn's `cn` package, re-exported from `packages/ui/src/lib/utils.ts`.** Every `components.json` pins the `utils` alias to `@metis/ui/lib/utils`, so `shadcn add` writes its imports there.
- **A combobox chip's remove button must have a name.** The generated `ComboboxChip` renders an unnamed remove button, so removable chips use `RemovableChip` (`src/components/removable-chip.tsx`): the primitive with `showRemove={false}` plus a `ChipRemove` labeled "Remove <label>".
- **A `Sheet` sized by its own class sets it on the side variant** (`data-[side=bottom]:h-dvh`, `data-[side=left]:w-72`): the primitive's `data-[side=…]` sizes outrank a plain `h-*` or `w-*` class.
- **Text fields render the size their call site gives them; nothing forces 16px.**
  - iOS zooms into a focused field under 16px, so `src/app/layout.tsx` → `generateViewport` sends `maximumScale: 1` to iPhone, iPad and iPod user agents only; iOS still allows pinch zoom, and Android, which never zooms on focus, keeps pinch zoom untouched.
  - The generated `Input` and `Textarea` default to `text-base md:text-sm`, so every call site sets its own size (`text-[13px]` for forms, `text-sm` for chat composers).
- **Page titles use `PageHeader`** (`src/components/page-header.tsx`): the title with its action on one row and the description full width below, wrapping the action under the title only when the row runs out of room. Every settings, workspace-settings, dashboard and members page uses it; profile headers (an MCP client, a member) keep their own layout.
- **The generated `CommandItem` always renders a trailing check icon**, invisible until the item is checked, and it keeps its width; search result rows hide it on phones (`src/components/search/result-row.tsx`).
- **Overlays are dialogs.** Anything that covers the page has `role="dialog"`, `aria-modal` and an accessible name: through the shadcn `Dialog`, or set explicitly on a bespoke shell such as the compose window.

### Brand and theme

- **`@metis/ui` is a brand-neutral component system; each app owns its brand.**
  - `tokens.css` holds only neutral black-and-white defaults, and each app overrides them in its own CSS.
  - The web app's workspace brand palettes (`amber` by default) live in `src/styles/brands.css`, imported after `@metis/ui/globals.css` so its equally specific selectors win.
  - The desktop renderer uses the neutral defaults as they are.
  - `apps/www` keeps its own components in `apps/www/src/components/ui/` ([www.md](www.md)).

### Shells and the source link

- **`MailShell` is the mail surface's chrome, and only `m/[mailbox]/layout.tsx` mounts it.** It holds the folder sidebar, the resizable folders / main / agent panels, the compose dialog, message drag-and-drop, and the mail chords and help. The workflow builder, the assistant, calendar and drive bring their own shells.
- **On phones, a surface's aside is a sheet opened from the surface's own titlebar, never from the rail.**
  - `ResponsiveAside` (`src/components/mobile-aside.tsx`) turns the aside into a left `Sheet` below `48rem`; `MobileAsideTrigger` sits first in the surface's header and renders only while an aside is registered.
  - The headers that carry it: the mail list and the scheduled, snoozed and subscriptions views, `CalendarHeader`, `DriveToolbar`, the workflow editor's top bar and the assistant header.
  - `/settings`, `/w/[slug]/settings` and `/dashboard` follow the same pattern: their sidebar is the aside, and `MobileSectionBar` (`src/components/mobile-section-bar.tsx`) at the top of the page carries the trigger and the section name. `/settings` and `/dashboard` sit outside the `/w` layout, so their layouts mount their own `MobileAsideProvider`.
- **Every page shows an always-visible link to the source with the running version, outside any menu.**
  - AGPL §13 binds anyone who runs a modified version for network users to prominently offer its source, so the link ships in the product; the operator points it at their own source with `METIS_SOURCE_URL` ([configuration.md](configuration.md)).
  - A new surface with no rail or sidebar goes under `src/app/(auth)/`, whose layout lays a transparent footer over the bottom of the page and pads the page's first element so a tall form never runs under it.
  - `/settings` and `/dashboard` put the full line at the bottom of their sidebar, and on phones, where the sidebar is a sheet, in `MobileSectionBar` beside the section name.
  - Every `/w/*` surface, including `/w/[slug]/settings`, shows a compact `GitBranch` icon and version at the bottom of the rail, which stays on screen on phones.
  - The icon is `GitBranch` because a fork's source may live on any host; the link points at the configured URL exactly as set.
  - The version is `apps/web/package.json` → `version` ([deployment.md](deployment.md)).

### Marks

- **Never hand-add, hand-edit or rename a file in `packages/ui/src/components/svgs/`.** It is `bunx shadcn@latest add @svgl/<name>` output; the registry picks the filename and casing (so `googleCalendar.tsx` sits beside `microsoft-outlook.tsx`), and a rename is rewritten back by the next add.
  - A mark the registry does not carry (or a wrapped PNG/JPG) goes in `brand-marks.tsx`, with raster art in `apps/web/public/brand/`; every mark satisfies `BrandMark`.
- **The app's own mark is one drawing, and every copy is rendered from it**: two white triangles meeting at the centre, like a bow tie, on a square black 256×256 tile (`MetisMark` uses neutral-900 for the tile, inverted in dark).
  - Change the paths in `icon.svg` and every drawn copy in the code map, then re-render every rendered file with ImageMagick.
  - `favicon.ico` holds 48, 32 and 16 px.
  - `apple-icon.png` is 180 px, square and unrounded, because iOS rounds it.
  - `apps/desktop/static/icon.png` is 1024 px RGBA: the electron-builder `icon` for macOS and Windows, and the window icon.
  - `apps/desktop/icons/` is `linux.icon`: one file per size the hicolor theme declares, because GNOME looks icons up only in the size folders `index.theme` lists, which has no 1024.
  - `apps/mobile/assets/icon.png` is square and opaque; `adaptive-icon.png` holds the triangles alone on transparency, at two thirds of their size in `icon.svg`, so they fill the 72dp visible area of the 108dp canvas over `#000000`.

## How it works

- **`packages/ui` follows shadcn's monorepo layout.**
  - `bunx shadcn@latest add <name>` run inside an app writes the primitive into `packages/ui/src/components/` and app-only blocks into the app.
  - Inside the package, files import themselves by package name (`@metis/ui/lib/utils`, Node self-reference).
  - The web app's and the desktop renderer's tsconfig map `@metis/ui/*` to `packages/ui/src/*` for the type checker; the mobile app uses its own primitives ([mobile.md](mobile.md)).
- **CSS layering.** The web app's and the desktop renderer's CSS start with `@import "@metis/ui/globals.css"`, which carries the tokens, the shadcn theme and an `@source` for the package's own files.
  - The web app adds `brands.css` and its editor and preview styles after it.
  - The desktop renderer adds its fonts and an `@source` for its own pages.
  - The mobile shell has its own Uniwind `global.css` ([mobile.md](mobile.md)).
- **Light/dark.** next-themes sets the `.dark` class before paint (default `dark`), so there is no flash; Tailwind v4's `@custom-variant dark` keys off that class.
- **Workspace brand.** The root layout renders `data-brand` on `<html>` from the active workspace's branding (`resolveThemeBrand`, default `DEFAULT_THEME_BRAND`).
  - `BrandSync` updates it on the client when navigation crosses into another workspace.
  - It applies the default brand while no 2FA-verified session exists.
  - Brand previews scope a palette with `.brand-preview[data-brand=…]`.
- **Page titles.** The root layout's `"%s • Metis Suite"` template titles every page, and `generateMetadata` in the mail, calendar and drive layouts names the resource (`src/workspace/titles.ts`).
