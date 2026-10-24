import { createHash } from "node:crypto";

import { type APIRequestContext, test as base, expect, type TestInfo } from "@playwright/test";

import { type Rpc, RpcError, rpcBodySchema, rpcErrorSchema } from "../clients/rpc";
import { type Account, harness } from "./harness";

export { type Rpc, RpcError } from "../clients/rpc";

export function rpcFor(request: APIRequestContext): Rpc {
  return async <T>(procedure: string, input: unknown = {}) => {
    const res = await request.post(`/rpc/${procedure.replaceAll(".", "/")}`, {
      data: { json: input },
    });
    const body = rpcBodySchema.parse(await res.json());
    if (!res.ok()) {
      const error = rpcErrorSchema.safeParse(body.json).data;
      throw new RpcError(res.status(), error?.code ?? "", error?.message ?? "");
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- black-box client: the calling test names the response shape it expects and asserts on the values
    return body.json as T;
  };
}

export function uniqueName(testInfo: TestInfo): string {
  const hash = createHash("sha256").update(`${testInfo.testId}:${testInfo.retry}`).digest("hex");
  return `e2e-${hash.slice(0, 10)}`;
}

interface Fixtures {
  account: Account;
  rpc: Rpc;
  llmGuard: undefined;
}

export const test = base.extend<Fixtures>({
  // oxlint-disable-next-line no-empty-pattern --Playwright reads a fixture's dependencies from this destructuring pattern
  account: async ({}, use) => {
    await use(await harness.account());
  },

  rpc: async ({ page }, use) => {
    await use(rpcFor(page.request));
  },

  llmGuard: [
    // oxlint-disable-next-line no-empty-pattern --Playwright reads a fixture's dependencies from this destructuring pattern
    async ({}, use, testInfo) => {
      const before = (await harness.misses()).length;
      await use(undefined);
      const added = (await harness.misses()).slice(before);
      const keys = [...new Set(added.map((m) => `${m.path} ${m.key}`))];
      if (testInfo.project.metadata.parallel === true) {
        if (keys.length > 0) {
          testInfo.annotations.push({
            type: "llm-miss",
            description: `${keys.join(", ")} (during this test or one running beside it; global teardown fails the run)`,
          });
        }
        return;
      }
      expect(keys, "this test caused LLM replay misses; see GET /llm-misses").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
