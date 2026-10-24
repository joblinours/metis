import "server-only";
import { type Client, createClient } from "@libsql/client";
import { sql } from "drizzle-orm";

import { config } from "@/config";

import { db } from ".";

const PROBE_TIMEOUT_MS = 5_000;

let mastraClient: Client | null = null;

function mastra(): Client {
  mastraClient ??= createClient(config.db.mastra);
  return mastraClient;
}

export async function databasesReady(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`no answer within ${PROBE_TIMEOUT_MS} ms`)),
      PROBE_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([
      Promise.all([db.run(sql`select 1`), mastra().execute("select 1")]),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
