import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const schema = process.env.DB_SCHEMA?.trim() || "public";
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
  console.error(`DB_SCHEMA "${schema}" is not a plain identifier`);
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });

try {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await sql.unsafe(`SET search_path TO "${schema}"`);
  await sql.unsafe(await Bun.file("schema.sql").text());
  console.log(`[metis-resend] schema applied to "${schema}"`);
} catch (err) {
  console.error("[metis-resend] could not apply the schema", err);
  process.exit(1);
} finally {
  await sql.end();
}
