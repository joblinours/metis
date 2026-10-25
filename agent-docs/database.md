# Database — schema, drivers and sqld

Where the schema lives and how it reaches a database, the one driver with two connections (app + Mastra), what sqld means for code, and Drizzle naming. Paths are relative to `apps/web/`. See also [AGENTS.md](../AGENTS.md), [auth.md](auth.md), [connections.md](connections.md), [deployment.md](deployment.md), [configuration.md](configuration.md).

## Code map

| Concern                            | Where                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Schema, the single source of truth | `src/db/schema.ts` (re-exports Better Auth's tables from `src/db/auth-schema.ts`) · `timestamp` helper |
| App client                         | `src/db/index.ts` → `db`, `Executor`                                                                   |
| Column encryption                  | `src/db/crypto.ts` → `encryptedText` ([connections.md](connections.md))                                |
| Mastra's store                     | `src/mastra/storage.ts` → `storage` (`LibSQLStore` over `config.db.mastra`)                            |
| Driver and connection shapes       | `src/config/schema.ts` → `dbConfigSchema`                                                              |
| `db:push` / `db:export`            | `drizzle.config.ts`                                                                                    |
| Schema for an empty database       | `scripts/preflight.ts` → `SCHEMA_PATH` (`/deploy/init.sql`, or `METIS_INIT_SQL`)                       |
| sqld key and token generation      | `bootstrap.sh` (repository root) → `gen_sqld_auth`; `bash bootstrap.sh sqld-auth` prints a pair        |

## Rules

- **`src/db/schema.ts` is the single source of truth.**
- **Schema changes reach a database only through `bun run db:push` from the root, which the project owner runs.**
- **Always give a camelCase property an explicit snake_case column name** (`text("next_due_at", …)`). Drizzle uses the JS name in queries but SQLite keeps the name the column was created with, so a mismatch is a runtime `no such column`.
- **One `METIS_DB_DRIVER` (`sqld`, `turso` or `local`) fixes the shape of both connections, `app` and `mastra`.**
  - The URL schemes and the required `authToken` per driver are in `dbConfigSchema`.
  - Both connections use the same driver; a mixed pair fails validation.
- **Mastra's database is separate from the app's**, so its writes never contend for the app database's single writer lock and `db:push` never sees its `mastra_*` tables (Mastra creates those itself).
- **`local` is dev-only: never deploy it or verify against it.** Anything that tests contention, multiple processes or the workflow runner under load runs on sqld. The reasons are under Deliberate limits.
- **Keep transactions short and database-only.** sqld serializes writes and rolls back an interactive transaction open for 5 s once another writer is waiting; the holder's commit then fails with `TRANSACTION_TIMEOUT`, and no setting changes this.
- **Functions that may run inside a transaction take an `Executor`** (`typeof db | Tx`), so the caller decides.

## How it works

- **sqld JWT auth.** sqld holds only the Ed25519 public key (`SQLD_AUTH_JWT_KEY`); the app holds an EdDSA JWT with the claim `{"a":"rw"}`.
  - The key is server-wide, so one token authorizes both namespaces; bootstrap writes it into `DATABASE_AUTH_TOKEN` and `MASTRA_DATABASE_AUTH_TOKEN`, keeping tokens exported before it ran.
  - The private key is discarded, so rotating means generating a new pair.
- **Namespaces.** The stack's sqld holds `app` and `mastra` as separate databases, reached at `http://app.sqld:8080` and `http://mastra.sqld:8080` ([deployment.md](deployment.md)).
- **A fresh database.** `preflight.Dockerfile` runs `drizzle-kit export` into `init.sql`, shipped in the preflight image as `/deploy/init.sql`.
  - Preflight applies it only when the database has no `user` table.
  - It fails with a pointer to `db:push` when the file is missing.

## Deliberate limits

- **There are no migrations.** Preflight creates the schema of an empty database; every later change goes through `db:push`.
  - The one data backfill is preflight's `backfillServerIds` ([servers.md](servers.md)).
- **`local` fails exactly where a mail client needs it to hold**, so it serves a single `next dev` and nothing else.
  - It contends with itself: `@libsql/client` pools up to 20 connections to one file with a busy timeout of 0, so two overlapping writes in one process (two requests, or a request and a workflow tick) fail at once with `SQLITE_BUSY`.
  - It silently loses writes: in `libsql` 0.5.29 a statement that fails with `SQLITE_BUSY` stays active while its connection reports no transaction; the pool reuses it, every later write on it reports success without committing, and it holds the write lock until the process restarts.
  - A busy timeout does not fix it, because the driver is synchronous: waiting for the lock freezes the event loop, including the code that holds the lock.
  - It can leave auth broken: Better Auth writes on startup, and if that write hits `SQLITE_BUSY`, sign-in stays broken until a restart.
  - It cannot be shared: the web app and the bullmq worker are separate processes, and two processes on one file hit all of the above.
