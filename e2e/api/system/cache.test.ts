import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";
import { z } from "zod";

import { allOk, checkDriver, setSection } from "../support/config";
import { McpSession, seededToken } from "../support/mcp";
import { ana } from "../support/session";

async function redis(...command: (string | number)[]): Promise<unknown> {
  const res = await fetch(env.cache.srhUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.cache.upstashToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return z.object({ result: z.unknown() }).parse(await res.json()).result;
}

async function countAnMcpCall(): Promise<void> {
  const session = await McpSession.open(await seededToken("checks-4"));
  await session.tools();
  await session.close();
}

async function keysAfterUse(): Promise<number> {
  await redis("FLUSHALL");
  await countAnMcpCall();
  return Number(await redis("DBSIZE"));
}

test(
  "the cache moves from memory to redis to upstash and back to memory, and each store is the one in use",
  async () => {
    const { rpc } = await ana();
    try {
      await setSection(rpc, "cache", {
        driver: "redis",
        url: env.cache.redisUrl,
      });
      allOk(await checkDriver(rpc, "cache"));
      expect(await keysAfterUse(), "redis holds the rate-limit counters").toBeGreaterThan(0);

      await setSection(rpc, "cache", {
        driver: "upstash",
        url: env.cache.upstashUrl,
        token: env.cache.upstashToken,
      });
      allOk(await checkDriver(rpc, "cache"));
      expect(
        await keysAfterUse(),
        "upstash (through SRH) holds the rate-limit counters",
      ).toBeGreaterThan(0);

      await setSection(rpc, "cache", { driver: "memory" });
      allOk(await checkDriver(rpc, "cache"));
      expect(await keysAfterUse(), "memory keeps nothing in redis").toBe(0);
    } finally {
      const { driver } = await rpc<{ driver: string }>("dashboard.system.cache");
      if (driver !== "memory") await setSection(rpc, "cache", { driver: "memory" });
    }
  },
  10 * 60_000,
);
