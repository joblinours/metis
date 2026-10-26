import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Client } from "@libsql/client";

export const MIGRATIONS_DIR = "migrations";

const BASELINE = "0000_baseline";
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const BREAKPOINT = /^--> statement-breakpoint$/m;
const MIGRATION_TABLE = "schema_migration";
const MIGRATION_TABLE_DDL =
  "CREATE TABLE `schema_migration` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`applied_at` integer NOT NULL\n)";
const RECORD = "INSERT INTO `schema_migration` (`id`, `applied_at`) VALUES (?, ?)";

export interface Migration {
  id: string;
  statements: string[];
}

export interface MigrateResult {
  applied: string[];
  baselined: boolean;
}

function isComment(chunk: string): boolean {
  return chunk.split("\n").every((line) => line.trim() === "" || line.trim().startsWith("--"));
}

export function readMigrations(dir = MIGRATIONS_DIR): Migration[] {
  const numbers = new Set<string>();
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .toSorted()
    .map((file) => {
      const number = FILE_PATTERN.exec(file)?.[1];
      if (!number) throw new Error(`[migrate] ${file} is not named NNNN_name.sql`);
      if (numbers.has(number)) throw new Error(`[migrate] two migrations are numbered ${number}`);
      numbers.add(number);
      const statements = readFileSync(join(dir, file), "utf8")
        .split(BREAKPOINT)
        .map((chunk) => chunk.trim())
        .filter((chunk) => !isComment(chunk));
      return { id: file.slice(0, -".sql".length), statements };
    });
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
  migrations: Migration[] = readMigrations(),
): Promise<MigrateResult> {
  const ids = migrations.map((migration) => migration.id);
  if (ids[0] !== BASELINE) {
    throw new Error(`[migrate] the first migration must be ${BASELINE}.sql`);
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
      // oxlint-disable-next-line eslint/no-await-in-loop -- migrations apply in order; each builds on the schema the previous one left
      await client.migrate([
        ...migration.statements,
        { sql: RECORD, args: [migration.id, Date.now()] },
      ]);
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
