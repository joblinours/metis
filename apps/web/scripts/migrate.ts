import { db } from "@/db";
import { migrateDatabase } from "@/db/migrations";

const { applied, baselined } = await migrateDatabase(db.$client);
if (baselined)
  console.log("[migrate] recorded 0000_baseline for a database created before migrations");
console.log(
  applied.length > 0
    ? `[migrate] applied ${applied.join(", ")}`
    : "[migrate] the database is up to date",
);
process.exit(0);
