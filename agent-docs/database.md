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
| Why `local` is dev-only, in full   | `README.md` (repository root) → "Database"                                                             |

## Rules

- **`src/db/schema.ts` is the single source of truth.**
- **Schema changes reach a database only through `bun run db:push` from the root, which the project owner runs.**
- **Always give a camelCase property an explicit snake_case column name** (`text("next_due_at", …)`). Drizzle uses the JS name in queries but SQLite keeps the name the column was created with, so a mismatch is a runtime `no such column`.
- **One `METIS_DB_DRIVER` (`sqld`, `turso` or `local`) fixes the shape of both connections, `app` and `mastra`.**
  - The URL schemes and the required `authToken` per driver are in `dbConfigSchema`.
  - Both connections use the same driver; a mixed pair fails validation.
- **Mastra's database is separate from the app's**, so its writes never contend for the app database's single writer lock and `db:push` never sees its `mastra_*` tables (Mastra creates those itself).
- **`local` is dev-only: never deploy it or verify against it** (`README.md` → "Database"). Anything that tests contention, multiple processes or the workflow runner under load runs on sqld.
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
