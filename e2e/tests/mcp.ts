import type { OAuthTokens } from "@modelcontextprotocol/client";
import { expect, type Page } from "@playwright/test";

import { beginAuthorization, clientIdFor, finishAuthorization } from "../clients/mcp";
import { enterCode } from "./auth";
import { rpcFor, test } from "./fixtures";
import { ANA_STATE, APP, harness } from "./harness";

export {
  type AuthorizationStart,
  authServerMetadata,
  beginAuthorization,
  type Callback,
  clientIdFor,
  connect,
  documentHits,
  ERAS,
  type Era,
  finishAuthorization,
  ISSUER,
  jsonRpc,
  listenForCallback,
  MODERN,
  modernBody,
  modernHeaders,
  PROTECTED_RESOURCE_METADATA,
  postMcp,
  RESOURCE,
  refresh,
  toolJson,
  toolText,
} from "../clients/mcp";

export interface ConsentChoices {
  sensitive?: boolean;
  totp?: () => Promise<string> | string;
}

export async function approveConsent(page: Page, choices: ConsentChoices = {}): Promise<void> {
  const main = page.getByRole("main");
  const approve = main.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeVisible();
  if (choices.sensitive) {
    await main.getByRole("checkbox", { name: "Turn every sensitive tool on" }).click();
    await expect(
      main.getByRole("checkbox", { name: "Turn every sensitive tool off" }),
    ).toBeChecked();
  }
  const code = choices.totp ? await choices.totp() : await harness.totp();
  await enterCode(page, code);
  await approve.click();
}

export async function denyConsent(page: Page): Promise<void> {
  await page.getByRole("main").getByRole("button", { name: "Deny", exact: true }).click();
}

export interface Grant {
  clientId: string;
  tokens: OAuthTokens;
}

export async function authorize(
  page: Page,
  clientId: string,
  choices: ConsentChoices = {},
): Promise<Grant> {
  const start = await beginAuthorization(clientId);
  await page.goto(start.authorizationUrl.toString());
  await approveConsent(page, choices);
  return { clientId, tokens: await finishAuthorization(clientId, start) };
}

export const mcpTest = test.extend<object, { workerGrant: Grant }>({
  workerGrant: [
    async ({ browser }, use, workerInfo) => {
      const context = await browser.newContext({
        baseURL: APP,
        storageState: ANA_STATE,
        timezoneId: "UTC",
      });
      const page = await context.newPage();
      const name = `worker-${workerInfo.parallelIndex}-${Date.now().toString(36)}`;
      const grant = await authorize(page, clientIdFor(name));
      try {
        await use(grant);
      } finally {
        await rpcFor(context.request)("mcp.deleteClient", {
          clientId: grant.clientId,
        });
        await context.close();
      }
    },
    { scope: "worker" },
  ],
});
