import { expect, test } from "vitest";

import { authorizeStatus, clientIdFor, documentHits } from "../../clients/mcp";
import { MCP_CLIENT_REDIRECT } from "../../lib/mcp-clients";
import { uniqueName } from "../support/poll";
import { ana } from "../support/session";

test("broken metadata documents and the private alias are refused", async () => {
  const { cookie } = await ana();
  for (const [name, reason] of [
    ["broken-mismatch", "does not match"],
    ["broken-oversize", "size limit"],
    ["broken-redirect", "302"],
    ["broken-slow", "timed out"],
    ["broken-content-type", "Content-Type"],
    ["broken-secret", "client_secret_basic"],
  ] as const) {
    const result = await authorizeStatus(cookie, clientIdFor(name), MCP_CLIENT_REDIRECT);
    expect(result.status, name).toBe(400);
    expect(result.body, name).toContain("invalid_client");
    expect(result.body, name).toContain(reason);
  }

  const privateName = `private-${Date.now().toString(36)}`;
  const refused = await authorizeStatus(
    cookie,
    clientIdFor(privateName, "private"),
    MCP_CLIENT_REDIRECT,
  );
  expect(refused.status).toBe(400);
  expect(refused.body).toContain("invalid_client");
  expect((await documentHits()).some((h) => h.path.includes(privateName))).toBe(false);
});

test("the app honours the metadata document's Cache-Control", async () => {
  const { cookie } = await ana();
  const name = uniqueName();
  const fetchesOf = async (cache: string) => {
    const clientId = `${clientIdFor(`${name}-${cache.replace(/\W/g, "")}`)}?cache=${encodeURIComponent(cache)}`;
    await authorizeStatus(cookie, clientId, MCP_CLIENT_REDIRECT);
    await authorizeStatus(cookie, clientId, MCP_CLIENT_REDIRECT);
    const path = new URL(clientId).pathname;
    return (await documentHits()).filter((h) => h.path.startsWith(path)).length;
  };
  expect(await fetchesOf("no-store")).toBe(2);
  expect(await fetchesOf("max-age=3600")).toBe(1);
});
