import { env } from "@metis/e2e/lib/env";
import { expect, test } from "vitest";

import { APP } from "../../clients/harness";
import type { Rpc } from "../../clients/rpc";
import { setSection } from "../support/config";
import { until } from "../support/poll";
import { ana } from "../support/session";
import { labelMap, restoreLabels, runWorkflow } from "../support/workflow";

const INTERNAL_DRAIN_MS = 10_000;
const TICK_WAIT_MS = 150_000;

interface Runner {
  status: { driver: string; lastSuccessAt: string | null };
}

function cronSecret(): string {
  const secret = process.env.CRON_SECRET;
  expect(secret, "CRON_SECRET in e2e/.env.fixture").toBeTruthy();
  return secret ?? "";
}

async function tickedBy(rpc: Rpc, driver: string): Promise<void> {
  const from = Date.now();
  await until(
    () => rpc<Runner>("dashboard.system.runner"),
    ({ status }) =>
      status.driver === driver &&
      status.lastSuccessAt !== null &&
      Date.parse(status.lastSuccessAt) > from,
    { timeout: TICK_WAIT_MS, interval: 5_000, what: `a tick from ${driver}` },
  );
}

async function tickRoute(): Promise<number> {
  const res = await fetch(`${APP}/api/workflows/tick`, {
    method: "POST",
    headers: { "x-metis-secret": cronSecret() },
  });
  return res.status;
}

test(
  "the runner moves from internal to cron to bullmq and back to internal, and each one runs workflows",
  async () => {
    const { rpc, account } = await ana();
    const before = await labelMap(rpc, account);
    const run = async () =>
      expect((await runWorkflow(rpc, account, "Label rebrand mail", TICK_WAIT_MS)).status).toBe(
        "completed",
      );
    try {
      await setSection(rpc, "workflowRunner", {
        driver: "cron",
        secret: cronSecret(),
      });
      await new Promise((resolve) => setTimeout(resolve, INTERNAL_DRAIN_MS));
      await tickedBy(rpc, "cron");
      await run();

      await setSection(rpc, "workflowRunner", {
        driver: "bullmq",
        redisUrl: env.cache.redisUrl,
        queuePrefix: "metis-e2e",
      });
      expect(await tickRoute(), "the cron route answers only under cron").toBe(404);
      await tickedBy(rpc, "bullmq");
      await run();

      await setSection(rpc, "workflowRunner", { driver: "internal" });
      await tickedBy(rpc, "internal");
      await run();
    } finally {
      try {
        const { status } = await rpc<Runner>("dashboard.system.runner");
        if (status.driver !== "internal") {
          await setSection(rpc, "workflowRunner", { driver: "internal" });
        }
      } finally {
        await restoreLabels(rpc, account, before);
      }
    }
  },
  15 * 60_000,
);
