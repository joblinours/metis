import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    // oxlint-disable-next-line typescript/no-non-null-assertion --exists
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
} satisfies Config;
