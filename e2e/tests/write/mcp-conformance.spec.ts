import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

import { z } from "zod";

import { uniqueName } from "../fixtures";
import { approveConsent, clientIdFor, ISSUER, RESOURCE, mcpTest as test } from "../mcp";

const { expect } = test;

const checksSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["SUCCESS", "FAILURE", "WARNING", "SKIPPED", "INFO"]),
    errorMessage: z.string().optional(),
  }),
);
type Check = z.infer<typeof checksSchema>[number];

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  if (!address || typeof address === "string") throw new Error("no free port");
  return address.port;
}

async function checksIn(dir: string): Promise<Check[]> {
  const checks: Check[] = [];
  for (const entry of await readdir(dir, { recursive: true })) {
    if (entry.endsWith("checks.json")) {
      checks.push(...checksSchema.parse(JSON.parse(await readFile(join(dir, entry), "utf8"))));
    }
  }
  return checks;
}

export default function mcpConformanceSpecs() {
  test("the authorization server passes the MCP conformance suite's authorization checks", async ({
    page,
  }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const cli = join(
      dirname(
        createRequire(import.meta.url).resolve("@modelcontextprotocol/conformance/package.json"),
      ),
      "dist/index.js",
    );
    const port = await freePort();
    const outputDir = testInfo.outputPath("conformance");
    const run = spawn(
      process.execPath,
      [
        cli,
        "authorization",
        "--url",
        ISSUER,
        "--client-id",
        clientIdFor(uniqueName(testInfo)),
        "--resource",
        RESOURCE,
        "--port",
        String(port),
        "--output-dir",
        outputDir,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    const exited = new Promise<number | null>((resolve) => run.on("close", resolve));
    const authorizationUrl = new Promise<string>((resolve) => {
      run.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const url = output.match(/^(http\S+\/oauth2\/authorize\?\S+)$/m)?.[1];
        if (url) resolve(url);
      });
      run.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
    });

    const url = await Promise.race([
      authorizationUrl,
      exited.then(() => {
        throw new Error(`conformance exited before authorizing:\n${output}`);
      }),
    ]);
    await page.goto(url);
    await approveConsent(page);
    await exited;
    await testInfo.attach("conformance-output", {
      body: output,
      contentType: "text/plain",
    });

    const checks = await checksIn(outputDir);
    expect(checks.length, output).toBeGreaterThan(0);
    expect(
      checks
        .filter((c) => c.status === "FAILURE")
        .map((c) => `${c.id}: ${c.errorMessage ?? c.name}`),
    ).toEqual([]);
  });
}
