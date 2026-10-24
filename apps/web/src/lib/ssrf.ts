import "server-only";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import { Agent, type Dispatcher, request } from "undici";

import { isOneOf } from "./guards";

const SPECIAL_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const SPECIAL_V6: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

const blocked = new BlockList();
for (const [net, prefix] of SPECIAL_V4) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of SPECIAL_V6) blocked.addSubnet(net, prefix, "ipv6");

const MAPPED_V6 = /^(?:::ffff:|(?:0{1,4}:){5}ffff:)/i;

export class UnsafeAddressError extends Error {}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    if (MAPPED_V6.test(address)) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

export async function resolvePublic(hostname: string): Promise<{ address: string; family: 4 | 6 }> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const literal = isIP(host);
  if (literal) {
    if (!isPublicAddress(host)) throw new UnsafeAddressError("blocked address");
    return { address: host, family: literal === 6 ? 6 : 4 };
  }
  const answers = await lookup(host, { all: true, verbatim: true });
  const first = answers[0];
  if (!first) throw new UnsafeAddressError("no DNS answer");
  for (const answer of answers) {
    if (!isPublicAddress(answer.address)) {
      throw new UnsafeAddressError("resolves to a blocked address");
    }
  }
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

function pinnedAgent(address: string, family: 4 | 6): Agent {
  return new Agent({
    connections: 1,
    pipelining: 0,
    connect: {
      lookup: (_hostname, options, callback) => {
        if ((options as { all?: boolean }).all) {
          callback(null, [{ address, family }], family);
        } else {
          callback(null, address, family);
        }
      },
    },
  });
}

export interface SafeRequestInit {
  method?: "GET" | "HEAD" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxRedirects?: number;
  timeoutMs?: number;
  protocols?: readonly ("https:" | "http:")[];
}

export interface SafeResponse {
  url: URL;
  status: number;
  headers: Dispatcher.ResponseData["headers"];
  body: Dispatcher.ResponseData["body"];
  close: () => Promise<void>;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);

async function discard(body: Dispatcher.ResponseData["body"]): Promise<void> {
  try {
    await body.dump();
  } catch {
    body.destroy();
  }
}

export async function safeRequest(
  input: string | URL,
  init: SafeRequestInit = {},
): Promise<SafeResponse> {
  const protocols = init.protocols ?? ["https:", "http:"];
  const signal = AbortSignal.timeout(init.timeoutMs ?? 10_000);
  let url = new URL(input);
  let method = init.method ?? "GET";
  let body = init.body;
  /* oxlint-disable eslint/no-await-in-loop -- each redirect hop is resolved and checked only after the previous response names it */
  for (let hop = 0; ; hop++) {
    if (!isOneOf(protocols, url.protocol)) {
      throw new UnsafeAddressError(`${url.protocol} is not allowed`);
    }
    if (url.username || url.password) {
      throw new UnsafeAddressError("credentials in URL");
    }
    const { address, family } = await resolvePublic(url.hostname);
    const agent = pinnedAgent(address, family);
    const res = await request(url, {
      dispatcher: agent,
      method,
      headers: init.headers,
      body,
      signal,
    }).catch(async (err) => {
      await agent.close();
      throw err;
    });
    const location = res.headers.location;
    const follow = (init.maxRedirects ?? 0) > 0;
    if (follow && REDIRECT.has(res.statusCode) && typeof location === "string") {
      await discard(res.body);
      await agent.close();
      if (hop >= (init.maxRedirects ?? 0)) {
        throw new UnsafeAddressError("too many redirects");
      }
      url = new URL(location, url);
      if (
        res.statusCode === 303 ||
        (method === "POST" && res.statusCode !== 307 && res.statusCode !== 308)
      ) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    return {
      url,
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
      close: async () => {
        await discard(res.body);
        await agent.close();
      },
    };
  }
  /* oxlint-enable eslint/no-await-in-loop */
}
