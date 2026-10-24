import { expect } from "vitest";
import { z } from "zod";

import { harness } from "../../clients/harness";
import { type Rpc, RpcError } from "../../clients/rpc";

interface ConfigForm {
  version: number;
  values: Record<string, unknown>;
}

interface CheckResult {
  label: string;
  status: string;
  message: string | null;
}

export interface Saved {
  saved: boolean;
  version: number;
  check: { results: CheckResult[] } | null;
}

const MAX_WAIT_SEC = 300;

export async function setSection(
  rpc: Rpc,
  section: string,
  values: Record<string, unknown>,
): Promise<Saved> {
  for (;;) {
    const form = await rpc<ConfigForm>("dashboard.system.form", { section });
    try {
      const saved = await rpc<Saved>("dashboard.system.update", {
        expectedVersion: form.version,
        sections: [{ section, values: { ...form.values, ...values }, entries: null }],
        code: await harness.totp(),
      });
      expect(saved.saved, `${section} was not saved: ${JSON.stringify(saved.check)}`).toBe(true);
      return saved;
    } catch (err) {
      if (!(err instanceof RpcError) || err.status !== 429) throw err;
      const wait = z.object({ retryAfterSec: z.number() }).safeParse(err.data).data?.retryAfterSec;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(wait ?? 60, MAX_WAIT_SEC) * 1000 + 1000),
      );
    }
  }
}

export async function checkDriver(rpc: Rpc, driver: string): Promise<CheckResult[]> {
  const { results } = await rpc<{ results: CheckResult[] }>("dashboard.system.check", {
    kind: "driver",
    driver,
  });
  return results;
}

export function allOk(results: CheckResult[]): void {
  expect(results.length).toBeGreaterThan(0);
  for (const result of results) {
    expect(result.status, `${result.label}: ${result.message}`).toBe("ok");
  }
}
