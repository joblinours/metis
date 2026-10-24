import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

import Database from "better-sqlite3";

const APP_ROOT = new URL("../../", import.meta.url).pathname;

export interface ScratchDatabase {
  app: string;
  mastra: string;
}

function pathsIn(dir: string): ScratchDatabase {
  return { app: `${dir}/app.db`, mastra: `${dir}/mastra.db` };
}

export async function createScratchDatabase(dir: string, seedSql?: URL): Promise<ScratchDatabase> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const { TSX_TSCONFIG_PATH: _, ...childEnv } = process.env;
  const exported = spawnSync("bunx", ["drizzle-kit", "export"], {
    cwd: APP_ROOT,
    env: childEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (exported.status !== 0) throw new Error("drizzle-kit export failed");

  const paths = pathsIn(dir);
  const sqlite = new Database(paths.app);
  sqlite.exec(exported.stdout);
  if (seedSql) sqlite.exec(await readFile(seedSql, "utf8"));
  sqlite.close();
  return paths;
}

export async function copyScratchDatabase(
  source: ScratchDatabase,
  dir: string,
): Promise<ScratchDatabase> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const paths = pathsIn(dir);
  await copyFile(source.app, paths.app);
  return paths;
}

export function scratchEnv(paths: ScratchDatabase): Record<string, string> {
  return {
    METIS_DB_DRIVER: "local",
    DATABASE_URL: `file:${paths.app}`,
    MASTRA_DATABASE_URL: `file:${paths.mastra}`,
  };
}

export function applyScratchDatabase(paths: ScratchDatabase): void {
  Object.assign(process.env, scratchEnv(paths));
  delete process.env.DATABASE_AUTH_TOKEN;
  delete process.env.MASTRA_DATABASE_AUTH_TOKEN;
}
