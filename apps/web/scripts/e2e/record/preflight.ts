import { access } from "node:fs/promises";
import { connect } from "node:net";

import { env } from "@metis/e2e/lib/env";
import { VIEWER_TIME_ZONE } from "@metis/e2e/lib/llm-scenarios";
import { z } from "zod";

import { ENROLLMENT, SEED_SQL } from "../harness-files";

const CONNECT_TIMEOUT_MS = 5_000;

const keyUsageSchema = z.object({
  data: z.object({
    usage: z.number(),
    limit_remaining: z.number().nullable(),
  }),
});

function reachable(host: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (problem: string | null) => {
      socket.destroy();
      resolve(problem);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish("timed out"));
    socket.once("connect", () => finish(null));
    socket.once("error", (err) => finish(err.message));
  });
}

function endpoint(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  return { host: parsed.hostname, port };
}

export interface KeyUsage {
  usage: number;
  remaining: number | null;
}

export async function openRouterUsage(): Promise<KeyUsage | null> {
  const { upstreamUrl, upstreamKey } = env.llm;
  if (!upstreamUrl || !upstreamKey) return null;
  if (!new URL(upstreamUrl).hostname.endsWith("openrouter.ai")) return null;
  const res = await fetch(`${upstreamUrl}/key`, {
    headers: { authorization: `Bearer ${upstreamKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`GET ${upstreamUrl}/key answered HTTP ${res.status}`);
  }
  const { data } = keyUsageSchema.parse(await res.json());
  return { usage: data.usage, remaining: data.limit_remaining };
}

export async function preflight(options: { plan: boolean }): Promise<KeyUsage | null> {
  let usage: KeyUsage | null = null;
  const problems: string[] = [];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone !== VIEWER_TIME_ZONE) {
    problems.push(`time zone is ${zone}; run with TZ=${VIEWER_TIME_ZONE}`);
  }
  for (const file of [ENROLLMENT, SEED_SQL]) {
    try {
      await access(file);
    } catch {
      problems.push(`${file.pathname} is missing; run bun run generate first`);
    }
  }

  const [webdavServer] = z
    .array(z.object({ url: z.string() }))
    .parse(JSON.parse(process.env.METIS_WEBDAV_SERVERS ?? "[]"));
  const servers: [string, { host: string; port: number }][] = [
    ["IMAP", { host: env.imap.host, port: env.imap.port }],
    ["CalDAV", endpoint(env.servers.caldavOrigin)],
    ["S3", endpoint(env.s3.endpoint)],
    ["WebDAV", endpoint(webdavServer?.url ?? env.webdav.url)],
    ["FTP", { host: env.ftp.host, port: env.ftp.port }],
    ["SFTP", { host: env.sftp.host, port: env.sftp.port }],
  ];
  const checks = await Promise.all(
    servers.map(async ([name, { host, port }]) => {
      const problem = await reachable(host, port);
      return problem
        ? `${name} at ${host}:${port} is unreachable (${problem}); run bun run up first`
        : null;
    }),
  );
  problems.push(...checks.filter((p): p is string => p !== null));

  if (!options.plan) {
    const { upstreamUrl, upstreamKey } = env.llm;
    if (!upstreamUrl || !upstreamKey) {
      problems.push("LLM_UPSTREAM_URL and LLM_UPSTREAM_KEY are required");
    } else {
      try {
        usage = await openRouterUsage();
        if (usage) {
          console.log(
            `[record] OpenRouter key valid: ${usage.usage} credits used so far, ${usage.remaining ?? "no limit"} remaining`,
          );
        }
      } catch (err) {
        problems.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (!env.typesafe.upstreamUrl || !env.typesafe.upstreamKey) {
      problems.push("TYPESAFE_UPSTREAM_URL and TYPESAFE_UPSTREAM_KEY are required");
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `preflight failed, nothing was sent upstream:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  console.log("[record] preflight passed");
  return usage;
}
