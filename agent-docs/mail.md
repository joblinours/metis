# Mail — sessions, adapters and providers

How a mail request reaches a provider: `MailSession`, the `MailAdapter` interface and its providers, the `all` aggregate mailbox, drafts, personal mail state and undo send.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [gateways.md](gateways.md), [mail-ai.md](mail-ai.md), [mail-rendering.md](mail-rendering.md), [servers.md](servers.md), [workflow-graph.md](workflow-graph.md), [orpc.md](orpc.md).

## Code map

| Concern                                             | Where                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session (user → workspace → mailboxes → fresh auth) | `src/mail/session.ts` → `MailSession`, `MailScope`, `scopeMessage`, `mailboxIds`, `sendingMailbox`, `forSender` · middleware `src/server/middlewares/mail-session.ts`                                                                                                                                                                                            |
| Adapter interface + factory                         | `src/mail/adapter.ts` → `MailAdapter`, `MailChanges`, `getMailAdapter` · rows that follow a move `src/mail/moves.ts` → `followMoves`, `carryMessageRows`, `MESSAGE_ROWS`                                                                                                                                                                                         |
| Provider folders and labels                         | adapter methods `listProviderFolders` … `createProviderTag` in `src/mail/adapter.ts` · domain `src/mail/provider-folders.ts` · procedures `src/server/routes/mail/folders.ts` · ops `src/ops/folders.ts` · client `src/hooks/use-provider-folders.ts`, sidebar `provider-folders-section.tsx`, menus `[folder]/_components/provider-actions.tsx`                 |
| The `all` mailbox                                   | `src/mail/aggregate.ts` → `getAggregateAdapter`                                                                                                                                                                                                                                                                                                                  |
| Providers                                           | `src/mail/providers/gmail.ts` → `gmailMail` · `microsoft.ts` → `microsoftMail` · `zoho.ts` → `zohoMail`, `detectRegion` (`src/connections/zoho-regions.ts` → `detectZohoRegion`) · `imap.ts` → `imapMail` · `imap-pool.ts` → `withImap`, `lockMailbox`, `SEARCH_FOLDERS`, `retireImapServers` · `gateway-client.ts` → `gatewayMail` ([gateways.md](gateways.md)) |
| Procedures                                          | `src/server/routes/mail/` (one file per area) · sender choice `src/server/routes/mail/sender.ts` → `resolveSender`                                                                                                                                                                                                                                               |
| Message cache, summaries cache                      | `src/mail/cache.ts` → `cacheMessage`, `getThreadSummary` ([mail-ai.md](mail-ai.md))                                                                                                                                                                                                                                                                              |
| Unsubscribe                                         | `src/mail/unsubscribe.ts` → `parseUnsubscribeHeader` · `src/mail/subscriptions.ts` → `scanSubscriptions`, `unsubscribeSenders` · table `mailUnsubscribe`                                                                                                                                                                                                         |
| Personal state                                      | `src/mail/mute.ts`, `src/mail/read-later.ts` · tables `mailMute`, `mailReadLater` in `src/db/schema.ts`                                                                                                                                                                                                                                                          |
| Mail list state (client)                            | `src/mail/mail-cache.ts` → `useMailList`, `useReadLaterList`, `refreshMailListHead`, `refreshReadLaterList`, `holdRemoved`, `setCachedLabels`, `mutedThreads`, `readLater` · `src/store/mail-store.ts` → `listTabs`, `selectedView`, `submittedSearch`, `updateEmail`, `removeEmail`, `removeEmails` · `src/lib/in-order.ts` → `inOrder`                         |
| Custom labels, contacts, raw source                 | `src/mail/custom-labels.ts` · `src/mail/contacts.ts` → `suggestContacts` · `src/mail/raw.ts` → `readRawMessage`                                                                                                                                                                                                                                                  |
| Undo send                                           | `src/store/undo-send-store.ts` → store action `startSend` · `src/components/undo-send-toast.tsx`                                                                                                                                                                                                                                                                 |
| Body rendering, labels                              | `src/mail/render/` ([mail-rendering.md](mail-rendering.md)) · `src/mail/labels.ts` ([mail-ai.md](mail-ai.md))                                                                                                                                                                                                                                                    |
| Workspace search over mail                          | `MailAdapter.searchAst` in every provider · `src/mail/search.ts` → `searchMail` ([search.md](search.md))                                                                                                                                                                                                                                                         |
| Opening a message after navigating                  | `src/mail/pending-open.ts` → `stashPendingOpen`, `takePendingOpen` (read by `src/app/w/[slug]/m/[mailbox]/[folder]/_components/folder-view.tsx`)                                                                                                                                                                                                                 |
| Provider list                                       | `src/connections/types.ts` → `CONNECTION_PROVIDERS`                                                                                                                                                                                                                                                                                                              |

## Rules

### Sessions and ids

- **Routes use `context.mail.adapter`.** The session already holds the right adapter, aggregate or single ([orpc.md](orpc.md)).
- **Mail domain functions take a `MailScope`, the session fields they read.** `MailScope` is user, workspace, role, adapter, resolved mailboxes and `isAggregate`.
  - A procedure passes its session; an agent tool passes `mailScopeFor(ctx, mailbox)` ([ai-agents.md](ai-agents.md)).
- **Composite ids never reach our DB.** Every `(mailboxId, messageId)` write goes through `scopeMessage(mail, id)`, whose branded `ScopedMessage` stops a composite id double-keying any mailbox-keyed table.
  - Reads use `mailboxIds(mail)` and re-compose ids on the way out when `mail.isAggregate`.
- **Writes are scoped by `mailboxIds(mail)` (mailbox rows) or `mail.mailboxes[].linkId` (workspace-link rows).** Server components pass route params; oRPC procedures take the slugs from their own validated input.
- **The aggregate adapter never guesses a sender.** `sendMessage` and draft writes throw on it, so those paths take an explicit `fromMailboxSlug` (the compose From picker, also carried on undo-send state).
- **Background behavior runs only in the workflow engine** ([workflow-runtime.md](workflow-runtime.md)); an inbox fetch triggers nothing.

### Moves

- **A move returns the message's new id, and callers keep it.**
  - `archiveMessage` and `restoreMessage` return the id after the move: IMAP reads the new UID from `COPYUID` and encodes `[folder, uidvalidity, uid]`; Zoho re-encodes `[folderId, messageId]` with the destination folder; Graph returns the moved message; Gmail and the gateways keep the id.
  - `deleteMessage` returns the id in Trash, or `null` when the message is gone for good (IMAP from Trash, the gateways always).
  - `updateDraft` returns the draft's id after the update (IMAP and Zoho replace the draft).
  - The workflow archive and restore steps pass the new id downstream, and the agent/MCP `updateDraft` returns it, so a later call never targets a moved message.
- **`changes` is the one optional adapter method: a change cursor over one folder for workflow feeds** ([workflow-graph.md](workflow-graph.md)).
  - Gmail reads history from a `historyId` (messages added or labelled into the folder); a 404 means the id expired.
  - Microsoft reads a messages delta filtered to mail received from the first call on; a 410 means the token expired.
  - IMAP keeps `uidvalidity:uidnext` and searches UIDs from it; a changed `uidvalidity` expires it.
  - It answers `null` where a folder has no cursor (Gmail archive, starred on Microsoft and IMAP) and the feed lists instead; Zoho and the gateways leave it out.
- **A message's own rows follow it when a move changes its id.** `getMailAdapter` wraps every adapter in `followMoves`, which re-keys the `MESSAGE_ROWS` tables (`mail_label`, `mail_read_later`) after `archiveMessage`, `restoreMessage`, `deleteMessage` and `batchDelete`.
  - So an IMAP or Outlook message archived and restored keeps its AI label (which the summarizer prompt carries) and its read-later mark.
  - `batchDelete` returns the ids that changed (old → new): IMAP from `COPYUID`, Graph from each batched `move` to Deleted Items (the same move `deleteMessage` makes), Zoho by re-encoding each id with the Trash folder; Gmail and the gateways keep their ids and return none.
  - A failed re-key logs `[mail]` and leaves the move, which already happened at the provider, in place.
- **A failed IMAP move is an error.** imapflow's `messageMove` returns `false` without throwing, so `moveMessage` throws on it; an archive into a missing folder must not report success.
- **Per-message provider fan-out is bounded.** Gmail lists ids, then reads each message's metadata through `mapLimit` (`src/lib/map-limit.ts`, `METADATA_CONCURRENCY` in `gmail.ts`), because Gmail answers a burst of parallel gets per user with 429s.
  - A message whose read fails is skipped and logged under `[gmail]`; the page fails only when every read failed.
  - Mark read in bulk is one `batchModify` per 1000 ids on Gmail and one `$batch` per 20 on Graph; Zoho already sends one `updatemessage`.
- **A missing IMAP message is an error**: `getHeaders` throws "Message not found" like `getMessage`, so a stale id is never read as a message without headers.

### Provider folders and labels

- **The provider is the source of truth for its own folders and labels; Metis stores none of them.** Every list, move and label change is a provider call, so it shows at once in gmail.com, Zoho Mail and Outlook.
  - They are separate from Metis labels (`mail_label`, one per message, [mail-ai.md](mail-ai.md)); a message carries any number of provider labels in `Email.labels`.
- **A folder or label is named by an opaque provider ref:** a Gmail label id, a Zoho `folderId` or tag `labelId`, a Graph folder id or an Outlook category name. `MAIL_FOLDERS` stays the seven standard folders.
- **The adapter methods are optional, like `changes`.** Gmail, Zoho and Outlook implement them; IMAP and the gateways leave them out, so their mailboxes show no section and the tools answer "has no provider folders".
  - Gmail: user labels are both folders (`kind: "label"`, hierarchy from `/` in the name) and tags; a move adds the label and removes `INBOX`, so the id stays.
  - Zoho: `loadAccount` keeps every folder with its `path` and parent; standard folders and Outbox/Templates/Snoozed are hidden; a move re-encodes `[folderId, messageId]`; tags are `/labels` with `updatemessage` `applyLabel` / `removeLabel`.
  - Outlook: folders are walked level by level (`childFolders`, at most `FOLDER_DEPTH`) and the well-known ones hidden; a move returns the new id; categories are read then patched as a merged list through `$batch`.
- **Labels need a scope on Zoho and Outlook** (`TAG_SCOPES` in `provider-folders.ts`, checked with `hasScope` against the grant, [connections.md](connections.md)). Without it the group says `tagsNeedReconnect` and label writes refuse with a reconnect message.
- **`moveToProviderFolder` goes through `followMoves`**, so a message's Metis label and read-later mark follow it to its new id.
- **In `all`, folder and label refs are composite (`<mailboxId>:<ref>`), like message ids.** The domain functions resolve them with `resolveScopedMessage` and call the owning mailbox's adapter directly; the aggregate adapter has no folder methods.
  - A move to a folder of another mailbox is refused; the sidebar shows one collapsible group per mailbox and a click stays in `all`.
- **A provider folder list is `?pfolder=<ref>` on the inbox route**, a `ListSource` of kind `provider` paged from `mail.folders.listEmails`; it has no tabs and no head refresh, and its key is in `mapCachedEmails` so star, read and remove show in it.

### Personal state and the list

- **Mute and read later are personal rows with no provider write**, keyed user × mailbox.
- **The list's tab lives in `mail-store` (`listTabs`, keyed workspace/mailbox/folder).** `FolderView` mounts `EmailList` in a different tree with and without an open message, and the remount must keep the tab rather than fall back to Primary, which hides transactions.
- **The list, its search results, labels, mute and read later live in the TanStack Query cache** (`mail-cache.ts`); `mail-store` keeps only UI state and the `updateEmail` / `removeEmail(s)` actions, which write into every cached list and search result.
  - `useMailList` pages `messages.list` 50 at a time with `useInfiniteQuery` (staleTime `Infinity`); polling and re-entering a folder fetch a 25-message head and merge it in (`refreshMailListHead`), so loaded pages stay.
  - `refreshMailListHead` skips a list refreshed in the last 30 s, so the `EmailList` remount on opening a message costs no fetch; a head with no known message refetches the loaded pages instead of leaving a gap.
  - The classify pass remembers the ids it already sent per mailbox at module level, so a remount never resends them and a failing model is asked once per message.
  - Other readers of the list (shortcuts, agent panel, detail) observe the cache without fetching (`useCurrentEmails`); `selectedView` tells them whether the folder list or the read-later list is showing.
- **Read later is its own list, not a filter over a folder's pages.** The `[folder]` route serves `read-later` as `FolderView` with `view="read-later"`, so it keeps the list and reading pane; `mail.readLater.listEmails` (`listReadLaterEmails`) reads each saved id from the provider.
  - A saved message shows wherever it was moved: `followMoves` re-keys its read-later row, and the list never pages the folder to find it.
  - The rows are filtered by the read-later id cache, so taking a message off the list hides its row at once and a refresh in flight cannot bring it back.
  - The page has no tab row; muted conversations stay hidden, as in the Inbox.
- **The Unread and Starred tabs and the sidebar label filters list from the server, never by filtering the folder's loaded pages** (`useEmailSource`, `listSource`), so a match on a later page shows and a sparse filter never pages through the whole folder.
  - Unread and Starred run the provider search for `mail-folder:<folder> is:unread|starred` (`mail.messages.listInState` → `listMailInState`), paged like search; IMAP pages a one-folder search by UID ([search.md](search.md)).
  - These lists and the sidebar label list keep their pages (staleTime `Infinity`) and refresh only when the user switches to them (`refreshListOnSwitch` remembers the list last shown).
  - `FolderView` remounts `EmailList` when a message opens or closes; a refetch then would drop the message just opened from **Unread**.
  - A sidebar label lists the mailbox's `mail_label` rows for that label from every folder, since a label row carries no folder (`mail.labels.listEmails` → `listLabelledEmails`); each page reads its messages from the provider (`readListedEmail`) and skips any that are gone.
  - The other tabs (Primary and the label tabs) still filter the loaded pages.
  - **An empty filter with more pages shows a Load more button, never an automatic walk.** Outlook, Zoho and the gateways cannot push `is:unread` / `is:starred` down, so a page of 25 folder messages may hold no match; the button fetches the next page on click.
- **A refresh in flight cannot undo a personal toggle.** The client sends each item's add/remove in order (`inOrder`), and every local edit of mute, read later or labels records its time (`markEdited`); a fetch that started before the edit keeps the edited cache instead of its response (`keepingEdits`), so no request is aborted and an older response never overwrites the edit.
- **A move or delete refreshes the label map and the read-later queries once its request settles** (`refreshMessageRowsAfter` in `removeEmail(s)`), because `followMoves` may have re-keyed their rows to a new id.
- **A list reload never brings back a row the user just removed.**
  - Archive, delete, restore, snooze and bulk delete remove the row first and pass their request to `removeEmail` / `removeEmails`, which hold the id (`holdRemoved`) until that request settles.
  - Every list and search fetch takes the time it started and drops a held id unless it started after the request settled; an earlier fetch may have read the folder before the provider moved the message.
  - The hold ends with the first fetch that started after the request settled, so a failed request lets the row return, and a message that comes back under the same id (a short snooze on Gmail or Outlook) stays visible.

### Other rules

- **Unsubscribe results are mailbox-scoped**: the sender dropped the address, not the person.
- **The RFC 8058 one-click POST is SSRF-guarded**: https only, no IP literal, no localhost, sent through `safeRequest` (`src/lib/ssrf.ts`).
- **`undo-send-toast.tsx` is presentational and imports no store.** `startSend` schedules `fire()` and calls `showUndoSendToast` itself, so the send does not depend on a mounted component and the two stay out of an import cycle.
- **Codes, OTPs and links in mail are stored and cached like any other content.** An "Expires in X min" label is display only; a derived copy adds no protection to a mailbox that has leaked.
- **IMAP needs a long-lived process** (Docker / `next start`): the pool lives in module memory, so on a serverless host every invocation reconnects.
- **Adding a provider**: implement `MailAdapter` (including `searchAst` with a `Dialect` for what its search can express, [search.md](search.md)), add it to `MAIL_ADAPTERS` in `src/mail/adapter.ts`, add a connections driver ([connections.md](connections.md) or [servers.md](servers.md)) and extend `CONNECTION_PROVIDERS`.

## How it works

- **Session.** `getMailSession(headers, workspaceSlug, mailboxSlug)` joins app user → workspace by slug → `mailbox_workspace × mailbox × connection` → fresh auth. A `MailSession` carries `mailboxSlug`, `isAggregate`, a ready-built `adapter` and `mailboxes: ResolvedMailbox[]`.
- **`all`.** A reserved slug served through the ordinary `/w/[slug]/m/[mailbox]/…` tree, so every folder, action and shortcut works unchanged.
  - `listMessages` / `search` fan out to every mailbox, merge-sort by date and pack the per-mailbox page tokens into one base64url cursor; a failing mailbox lands in `mailboxErrors` and the rest still render.
  - `listMessages` asks each mailbox for a share of the page (`mailboxBudget`), not the whole page; the watermark keeps the merged order exact at any share, so `all` costs about one page across all accounts.
  - Each mailbox has `MAILBOX_TIMEOUT_MS`; a mailbox that misses it lands in `mailboxErrors` instead of holding the page, and a slow one is logged under `[mail/aggregate]`.
  - Every per-message method resolves the composite id `<mailboxId>:<providerId>` and delegates to that mailbox's adapter.
- **Drafts live at the provider** (`createDraft` / `updateDraft` / `deleteDraft`). Zoho has no in-place patch, so its update creates the new draft and deletes the old one.
- **Undo send** is a hold of `UNDO_SEND_HOLD_MS` in `undo-send-store`; send later and snooze are built-in workflows ([workflow-graph.md](workflow-graph.md)).
- **A Zoho message id carries its folder**: base64url of `[folderId, messageId]` (`encodeMessageId` in `zoho.ts`), because Zoho's per-message calls (content, attachment info, attachment content) all need the folder in the path.
  - Ids are built from the `folderId` Zoho reports on each listed message, so a message in a user-made folder resolves exactly; bulk `updatemessage` calls send only the decoded `messageId`.
- **Zoho region.** Every Zoho mail and calendar call goes through `detectZohoRegion` (`src/connections/zoho-regions.ts`), which probes each DC and pins the first 200 per token, in memory and in the cache driver.
  - Probes start with the region the last probe found, then the instance setting `zoho.region` (owner dashboard), so a new hourly token costs one probe when either is right.
- **IMAP pool.** One `ImapFlow` per credential fingerprint in a module-level map, idle-evicted; `getMailboxLock` serializes access, so one account never exceeds one connection (Dovecot caps 10 per IP).
  - Every mailbox access goes through `ctx.lock(path)` (`lockMailbox`), which sends a `NOOP` when the pooled connection already has that mailbox selected.
  - A server reports another session's changes only around a command, and a `SEARCH` sees only messages the session was told about, so without the `NOOP` the first list after new mail arrives misses that mail.
  - The folder map is discovered once per connection; a lookup that finds no folder clears it, so a folder created later is found on the next call.
  - When a server entry changes, `retireImapServers` drops that entry's pooled connections: idle ones log out at once, busy ones close after their last lease.
- **IMAP threading is synthesized.** `threadId` is the first Message-ID in `References`, else the message's own, computed from the envelope fetch with no extra round trip.
- **IMAP sending.** SMTP does not file sent mail, so every send APPENDs to `\Sent` itself; a failed APPEND logs and still reports success, because the send succeeded.

## Deliberate limits

- **IMAP is known-degraded.**
  - Search is `SEARCH TEXT` over `SEARCH_FOLDERS` (Inbox, Archive, Sent): substring, no ranking.
  - `starred` is a `\Flagged` search.
  - Folders map through SPECIAL-USE with name fallbacks.
