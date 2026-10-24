import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { config } from "@/config";

import * as schema from "./schema";

export const db = drizzle(createClient(config.db.app), { schema });

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;
