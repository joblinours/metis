import type { Client, InStatement, InValue } from "@libsql/client";

export type Row = Record<string, unknown>;

export interface MigrationDb {
  read(sql: string, args?: InValue[]): Promise<Row[]>;
  apply(statements: InStatement[]): Promise<void>;
}

export interface Migration {
  id: string;
  up(db: MigrationDb): Promise<void>;
}

export function schemaMigration(id: string, statements: InStatement[]): Migration {
  return { id, up: (db) => db.apply(statements) };
}

const BASELINE = "0000_baseline";
const ID_PATTERN = /^\d{4}_[a-z0-9_]+$/;
const MIGRATION_TABLE = "schema_migration";
const MIGRATION_TABLE_DDL =
  "CREATE TABLE `schema_migration` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`applied_at` integer NOT NULL\n)";
const RECORD = "INSERT INTO `schema_migration` (`id`, `applied_at`) VALUES (?, ?)";

export interface MigrateResult {
  applied: string[];
  baselined: boolean;
}

function checkOrder(migrations: readonly Migration[]): void {
  const numbers = new Set<string>();
  for (const migration of migrations) {
    if (!ID_PATTERN.test(migration.id)) {
      throw new Error(`[migrate] ${migration.id} is not named NNNN_name`);
    }
    const number = migration.id.slice(0, 4);
    if (numbers.has(number)) throw new Error(`[migrate] two migrations are numbered ${number}`);
    numbers.add(number);
  }
  const ids = migrations.map((migration) => migration.id);
  if (ids.join("\n") !== ids.toSorted().join("\n")) {
    throw new Error("[migrate] the migrations are not listed in number order");
  }
}

function migrationDb(client: Client, id: string): { db: MigrationDb; applied: () => boolean } {
  let applied = false;
  return {
    applied: () => applied,
    db: {
      async read(sql, args = []) {
        const result = await client.execute({ sql, args });
        return result.rows.map((row): Row =>
          Object.fromEntries(result.columns.map((column) => [column, row[column]])),
        );
      },
      async apply(statements) {
        if (applied) throw new Error(`[migrate] ${id} applied twice; a migration applies once`);
        applied = true;
        await client.migrate([...statements, { sql: RECORD, args: [id, Date.now()] }]);
      },
    },
  };
}

async function tableExists(client: Client, name: string): Promise<boolean> {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [name],
  });
  return result.rows.length > 0;
}

async function foreignKeyViolations(client: Client): Promise<number> {
  return (await client.execute("PRAGMA foreign_key_check")).rows.length;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function migrateDatabase(
  client: Client,
  migrations: readonly Migration[],
): Promise<MigrateResult> {
  checkOrder(migrations);
  const ids = migrations.map((migration) => migration.id);
  if (ids[0] !== BASELINE) {
    throw new Error(`[migrate] the first migration must be ${BASELINE}`);
  }

  let baselined = false;
  if (!(await tableExists(client, MIGRATION_TABLE)) && (await tableExists(client, "user"))) {
    await client.batch(
      [MIGRATION_TABLE_DDL, { sql: RECORD, args: [BASELINE, Date.now()] }],
      "write",
    );
    baselined = true;
  }

  const done = new Set<string>();
  if (await tableExists(client, MIGRATION_TABLE)) {
    const rows = await client.execute(`SELECT id FROM ${MIGRATION_TABLE}`);
    for (const row of rows.rows) {
      if (typeof row.id === "string") done.add(row.id);
    }
  }
  const unknown = [...done].filter((id) => !ids.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `[migrate] the database has ${unknown.join(", ")}, which this release does not ship: a newer release migrated it. Install that release or a newer one, or restore the database from a backup taken before it.`,
    );
  }

  const pending = migrations.filter((migration) => !done.has(migration.id));
  if (pending.length === 0) return { applied: [], baselined };

  const violationsBefore = await foreignKeyViolations(client);
  const applied: string[] = [];
  for (const migration of pending) {
    try {
      const run = migrationDb(client, migration.id);
      // oxlint-disable-next-line eslint/no-await-in-loop -- migrations apply in order; each builds on the schema and data the previous one left
      await migration.up(run.db);
      if (!run.applied()) throw new Error("it never applied its changes");
    } catch (err) {
      const kept = applied.length > 0 ? ` ${applied.join(", ")} stay applied.` : "";
      throw new Error(
        `[migrate] ${migration.id} failed and was rolled back: ${messageOf(err)}.${kept}`,
        { cause: err },
      );
    }
    applied.push(migration.id);
  }

  const added = (await foreignKeyViolations(client)) - violationsBefore;
  if (added > 0) {
    throw new Error(
      `[migrate] ${applied.join(", ")} left ${added} new foreign key violation(s). Restore the database from the snapshot or backup taken before this release.`,
    );
  }
  return { applied, baselined };
}
