import { createHash } from "node:crypto";

import { expect } from "vitest";

export async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeout = 60_000, interval = 1_000, what = "condition" } = {},
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `${what} not reached within ${timeout} ms; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export function uniqueName(): string {
  const hash = createHash("sha256")
    .update(`${expect.getState().currentTestName ?? ""}:${Date.now()}`)
    .digest("hex");
  return `e2e-${hash.slice(0, 10)}`;
}
