import "server-only";
import { sectionCached } from "@/config/runtime";
import type { CacheConfig } from "@/config/schema";

import { createMemoryDriver } from "./drivers/memory";
import { createRedisDriver } from "./drivers/redis";
import { createUpstashDriver } from "./drivers/upstash";
import type { CacheDriver } from "./types";

const CLOSE_GRACE_MS = 30_000;

export function buildCacheDriver(cfg: CacheConfig): CacheDriver {
  switch (cfg.driver) {
    case "memory":
      return createMemoryDriver();
    case "redis":
      return createRedisDriver(cfg);
    case "upstash":
      return createUpstashDriver(cfg);
  }
}

export const getCache: () => CacheDriver = sectionCached(
  ["cache"],
  (cfg) => buildCacheDriver(cfg.cache),
  (previous) => {
    const timer = setTimeout(() => {
      previous.close().catch((err) => {
        console.error("[cache] closing the replaced driver failed", err);
      });
    }, CLOSE_GRACE_MS);
    timer.unref();
  },
);

export async function warmupCache() {
  await getCache().warmup();
}

export function toSecondaryStorage() {
  return {
    get: (key: string) => getCache().get(key),
    getAndDelete: (key: string) => getCache().getAndDelete(key),
    set: (key: string, value: string, ttl?: number) => getCache().set(key, value, ttl),
    delete: (key: string) => getCache().del(key),
    increment: (key: string, ttl: number) => getCache().incr(key, ttl),
  };
}
