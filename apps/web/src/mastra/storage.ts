import "server-only";
import { LibSQLStore } from "@mastra/libsql";

import { config } from "@/config";

export const storage = new LibSQLStore({
  id: "metis-mastra",
  ...config.db.mastra,
});
