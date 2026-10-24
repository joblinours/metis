import "server-only";
import { Redis } from "@upstash/redis";

import type { UpstashCacheConfig } from "@/config/schema";

import { INCR_EXPIRE } from "../incr-expire";
import type { CacheDriver } from "../types";

const PREFIX = "metis:";

function prefixed(key: string) {
  return `${PREFIX}${key}`;
}

export function createUpstashDriver(cfg: UpstashCacheConfig): CacheDriver {
  const { url, token } = cfg;

  const redis = new Redis({
    url,
    token,
    automaticDeserialization: false,
  });

  return {
    async warmup() {
      await redis.ping();
    },
    async close() {},
    async get(key) {
      return redis.get<string>(prefixed(key));
    },
    async getAndDelete(key) {
      return redis.getdel<string>(prefixed(key));
    },
    async set(key, value, ttlSec) {
      if (ttlSec !== undefined) {
        await redis.set(prefixed(key), value, { ex: ttlSec });
      } else {
        await redis.set(prefixed(key), value);
      }
    },
    async del(key) {
      await redis.del(prefixed(key));
    },
    async incr(key, ttlSec) {
      return Number(await redis.eval(INCR_EXPIRE, [prefixed(key)], [String(ttlSec)]));
    },
  };
}
