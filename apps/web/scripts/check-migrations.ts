import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type Client, createClient } from "@libsql/client";

import { migrateDatabase } from "@/db/migrations";

type Shape = Map<string, string>;

type Row = Record<string, unknown>;

async function rows(client: Client, sql: string, arg?: string): Promise<Row[]> {
  const result = await client.execute({ sql, args: arg === undefined ? [] : [arg] });
  return result.rows.map((row) => Object.fromEntries(result.columns.map((c) => [c, row[c]])));
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error(`[db:check] expected a name, got ${typeof value}`);
  return value;
}

async function indexesOf(client: Client, table: string) {
  const list = await rows(
    client,
    'SELECT name, "unique", origin, partial FROM pragma_index_list(?)',
    table,
  );
  const indexes = await Promise.all(
    list.map(async (index) => {
      const name = text(index.name);
      const columns = (
        await rows(client, "SELECT name FROM pragma_index_info(?) ORDER BY seqno", name)
      ).map((column) => text(column.name));
      const key = name.startsWith("sqlite_autoindex_") ? `auto(${columns.join(",")})` : name;
      return { key, unique: index.unique, origin: index.origin, partial: index.partial, columns };
    }),
  );
  return indexes.toSorted((a, b) => a.key.localeCompare(b.key));
}

async function shapeOf(client: Client): Promise<Shape> {
  const tables = (
    await rows(
      client,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).map((row) => text(row.name));
  const shapes = await Promise.all(
    tables.map(async (table) => {
      const [columns, indexes, foreignKeys] = await Promise.all([
        rows(
          client,
          'SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?) ORDER BY name',
          table,
        ),
        indexesOf(client, table),
        rows(
          client,
          'SELECT "table", "from", "to", on_update, on_delete FROM pragma_foreign_key_list(?) ORDER BY "from"',
          table,
        ),
      ]);
      return [table, JSON.stringify({ columns, indexes, foreignKeys })] as const;
    }),
  );
  return new Map(shapes);
}

function exportedSchema(): string {
  const { TSX_TSCONFIG_PATH: _, ...env } = process.env;
  const exported = spawnSync("bunx", ["drizzle-kit", "export"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (exported.status !== 0) throw new Error("[db:check] drizzle-kit export failed");
  return exported.stdout;
}

const dir = mkdtempSync(join(tmpdir(), "metis-migrations-"));
try {
  const migrated = createClient({ url: `file:${join(dir, "migrated.db")}` });
  await migrateDatabase(migrated);
  const expected = createClient({ url: `file:${join(dir, "expected.db")}` });
  await expected.executeMultiple(exportedSchema());

  const [actual, wanted] = await Promise.all([shapeOf(migrated), shapeOf(expected)]);
  migrated.close();
  expected.close();

  const problems: string[] = [];
  for (const [table, shape] of wanted) {
    const got = actual.get(table);
    if (got === undefined) problems.push(`${table}: in src/db/schema.ts, created by no migration`);
    else if (got !== shape) {
      problems.push(
        `${table}: the migrations leave\n    ${got}\n  src/db/schema.ts has\n    ${shape}`,
      );
    }
  }
  for (const table of actual.keys()) {
    if (!wanted.has(table))
      problems.push(`${table}: created by a migration, absent from src/db/schema.ts`);
  }

  if (problems.length > 0) {
    console.error(
      `[db:check] the migrations do not match src/db/schema.ts:\n  ${problems.join("\n  ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`[db:check] the migrations match src/db/schema.ts (${wanted.size} tables)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
