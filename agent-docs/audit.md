# Audit log

What the audit log records, where each event is written, who reads which slice of it, how long it is kept, and what it may and may not be claimed to prove.
Paths are relative to `apps/web/`.
See also [AGENTS.md](../AGENTS.md), [workspaces.md](workspaces.md) (the data export), [dashboard.md](dashboard.md), [configuration.md](configuration.md), [workflow-graph.md](workflow-graph.md), [mcp.md](mcp.md).

## Code map

| Concern                   | Where                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions, channels, labels | `src/types/audit.ts` → `AUDIT_ACTIONS`, `AUDIT_VIAS`, `AUDIT_RESOURCE_KINDS`, `AUDIT_ACTION_LABELS`                                                                                                                       |
| Table                     | `src/db/schema.ts` → `auditEvent`                                                                                                                                                                                         |
| Writing and reading       | `src/audit/index.ts` → `recordAuditEvent`, `appActor`, `AuditActor`, `listUserAuditEvents`, `listWorkspaceAuditEvents`, `listInstanceAuditEvents`, `exportUserAuditEvents`                                                |
| Retention                 | `src/audit/prune.ts` → `pruneAuditEvents` · run by the `system:audit-prune` workflow (`src/workflow/builtins/system.ts`) · `METIS_AUDIT_RETENTION_DAYS` in `src/config/schema.ts` → `auditConfigSchema`                   |
| Procedures                | `src/server/routes/audit.ts` → `audit.mine`, `audit.workspace` · `src/server/routes/dashboard.ts` → `dashboard.audit` (`src/dashboard/stats.ts` → `dashboardAudit`)                                                       |
| Owner MCP tool            | `getInstanceAuditLog` in `src/mastra/mcp/tools/instance.ts` (body `src/mastra/toolkit/instance.ts` → `instanceAuditLog`)                                                                                                  |
| UI                        | shared list `src/components/audit-event-list.tsx` → `AuditEventList` · `src/app/settings/security/_components/security-activity-section.tsx` · `src/app/w/[slug]/settings/activity/page.tsx` · `src/app/dashboard/audit/` |
| Export                    | `src/account/export.ts` → `securityActivity` ([workspaces.md](workspaces.md))                                                                                                                                             |

## Rules

### What is recorded

- **The log records security-relevant changes, never reads or mail content.**
  - Account: two-factor disabled, sign-in alerts turned off ([auth.md](auth.md)), account deleted.
  - MCP: a client added by hand, a CIMD client approved at consent, a disabled client re-enabled, a sensitive tool switched on (`sensitiveToolsTurnedOn` in `src/mcp/tools.ts`).
  - Resources: a grant revoked (`connection.deleted`), a mailbox, calendar or drive deleted or detached from a workspace, for all three kinds alike.
  - Workspaces: role changes, ownership transfers, member removals, workspace invites sent and revoked, workspace deletion.
  - Sign-up invites sent and revoked.
- **An event is written after the change succeeds, in the function every caller shares.**
  - `removeWorkspaceMember`, `revokeWorkspaceInvite` (`src/workspace/admin.ts`), `sendSignupInvite` and `revokeSignupInvite` (`src/auth/signup.ts`) take a `by: AuditActor`, so the app, the Workspace Assistant and MCP write the same event.
  - Route-only changes record in their procedure (sign-in alerts in `user.updatePreferences`, only when the stored value goes from on to off); two-factor disable records in `hooks.after` on `/two-factor/disable` in `src/auth/server.ts`, because the client calls Better Auth directly.
- **A failed audit insert never fails the change.** `recordAuditEvent` catches and logs `[audit] failed to record …`, because the change it describes has already happened.
- **`via` names the channel:** `app` (a signed-in request, with IP and user agent), `assistant` (the Workspace Assistant, with the chat request's headers) or `mcp` (with `mcp_client_id`, no network details).

### Shape and scope

- **Rows outlive what they describe, so every reference is a set-null FK beside a snapshot.** `actor_user_id`, `workspace_id` and `target_user_id` go null when the row behind them is deleted; `actor_email`, `workspace_name` and `target_label` keep the name, the way `ai_usage` keeps its rows.
  - `recordAuditEvent` looks each id up at write time; a missing row (the deleted account, the deleted workspace) is stored as null with the snapshot the caller passed.
  - So `account.deleted` and `workspace.deleted` are written after the delete, with no FK to the gone row.
- **A deleted account's email stays in the log until retention removes the row.** Erasure removes the account; the security record of what it did is kept for the retention period.
- **Nothing updates or deletes an event except the prune.** There is no procedure or tool that edits one.

### Who reads what

- **A user reads every event they did or that targeted them** (`audit.mine`, actor or target is the user), with IP and user agent.
- **Owners and admins read their workspace's events** (`audit.workspace`, keyed by `workspace_id`), without IP or user agent; members get `FORBIDDEN`.
- **The instance owner reads every event** (`dashboard.audit`, `ownerSession`), the only place account deletions stay visible; a deleted workspace stays visible there and in the deleter's own feed.
- **Events with no workspace never reach a workspace's view**: deleting a resource from account settings and revoking a grant are account-level, even when the resource was linked to workspaces.
- **The owner MCP tool drops IP and user agent**, so no network detail reaches a model.
- **The data export carries the user's own events** as `securityActivity`, without row ids or the top-level `mcpClientId`; an MCP event's `detail.clientId` stays, because it names the user's own client ([workspaces.md](workspaces.md)).

### Retention and claims

- **Retention is boot config (`METIS_AUDIT_RETENTION_DAYS`, default 365, at least 1), never instance config**, so a leaked dashboard session cannot shorten it to erase events.
- **`system:audit-prune` deletes events older than the retention period once a day** (03:30 UTC).
- **Never describe the log as tamper-evident or tamper-proof for self-hosting.** The operator holds the database and can change any row; the dashboard says so.
  - Metis Cloud copy may claim restricted database access and the retention period, because those are operational facts of the hosted service, not properties of this code.

## How it works

- **Paging.** Every list is newest first (`created_at`, then `id`), 50 per page (`AUDIT_PAGE_SIZE`); `nextCursor` is `<created_at ms>.<id>` of the last row, and a malformed cursor reads the first page.
- **Describing an event.** Rows store machine values (`action`, `resource_kind`, `detail` such as `{ from, to }` for a role change or `{ tools }` for sensitive tools); `AuditEventList` turns them into the line a person reads.

## Deliberate limits

- **No hash chain or signature.** It would prove nothing against an operator who holds the database and the app's keys.
- **Removing a member does not write a separate detach event per resource**; the `member.removed` event covers the links `removeMember` drops.
- **No filters or search** on any view; the owner pages through the newest events.
