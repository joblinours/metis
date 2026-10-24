import Database from "better-sqlite3";
import { z } from "zod";

type Cell = string | number | bigint | null | Uint8Array;

const columnRowsSchema = z.array(z.object({ name: z.string() }));
const tableRowsSchema = z.array(z.object({ name: z.string(), sql: z.string() }));
const indexRowsSchema = z.array(z.object({ sql: z.string() }));

function isCell(value: unknown): value is Cell {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  );
}

function cellRows(rows: unknown[]): Cell[][] {
  return rows.map((row) => {
    if (!Array.isArray(row) || !row.every(isCell)) {
      throw new Error("[e2e] unexpected sqlite row shape");
    }
    return row;
  });
}

function literal(value: Cell): string {
  if (value === null) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function guarded(sql: string): string {
  return sql
    .replace(/^CREATE TABLE (?!IF NOT EXISTS)/i, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, "CREATE $1INDEX IF NOT EXISTS ");
}

function columnsOf(db: Database.Database, table: string): string[] {
  return columnRowsSchema
    .parse(db.prepare("SELECT name FROM pragma_table_info(?)").all(table))
    .map((c) => c.name);
}

function inserts(table: string, columns: string[], rows: Cell[][]): string[] {
  const columnList = columns.map(ident).join(",");
  return rows.map(
    (row) => `INSERT INTO ${ident(table)} (${columnList}) VALUES (${row.map(literal).join(",")});`,
  );
}

export function dumpRows(
  path: string,
  skipTables: Set<string>,
  options: { schema?: boolean; ifNotExists?: boolean } = {},
): string {
  const db = new Database(path, { readonly: true });
  const tables = tableRowsSchema.parse(
    db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid",
      )
      .all(),
  );
  const ddl = (sql: string) => (options.ifNotExists ? guarded(sql) : sql);

  const out = ["PRAGMA foreign_keys=OFF;", "BEGIN;"];
  for (const { name, sql } of tables) {
    if (skipTables.has(name)) continue;
    if (options.schema) out.push(`${ddl(sql)};`);
    const columns = columnsOf(db, name);
    const rows = cellRows(
      db
        .prepare(`SELECT ${columns.map(ident).join(",")} FROM ${ident(name)} ORDER BY rowid`)
        .safeIntegers(true)
        .raw(true)
        .all(),
    );
    out.push(...inserts(name, columns, rows));
  }
  if (options.schema) {
    const indexes = indexRowsSchema.parse(
      db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY rowid",
        )
        .all(),
    );
    for (const { sql } of indexes) out.push(`${ddl(sql)};`);
  }
  out.push("COMMIT;", "");
  db.close();
  return out.join("\n");
}

export function dumpNewRows(
  path: string,
  basePath: string | null,
  tables: readonly string[],
): { sql: string; counts: Record<string, number> } {
  const db = new Database(path, { readonly: true });
  if (basePath) db.prepare("ATTACH DATABASE ? AS base").run(basePath);
  const out = ["PRAGMA foreign_keys=OFF;", "BEGIN;"];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const columns = columnsOf(db, table);
    const fresh = basePath ? ` WHERE "id" NOT IN (SELECT "id" FROM base.${ident(table)})` : "";
    const rows = cellRows(
      db
        .prepare(
          `SELECT ${columns.map((c) => `main.${ident(table)}.${ident(c)}`).join(",")} FROM main.${ident(table)}${fresh} ORDER BY rowid`,
        )
        .safeIntegers(true)
        .raw(true)
        .all(),
    );
    counts[table] = rows.length;
    out.push(...inserts(table, columns, rows));
  }
  out.push("COMMIT;", "");
  db.close();
  return { sql: out.join("\n"), counts };
}
