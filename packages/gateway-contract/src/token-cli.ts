#!/usr/bin/env bun
import process from "node:process";

const [rawEndpoint, action, address] = process.argv.slice(2);
const endpoint = rawEndpoint?.replace(/\/+$/, "");
const adminToken = process.env.ADMIN_TOKEN;

if (!endpoint || !adminToken || !action) {
  console.error(`Usage:
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com create you@domain.com
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com revoke you@domain.com
  ADMIN_TOKEN=... metis-gateway-token https://gateway.example.com list

ADMIN_TOKEN is the API_TOKEN secret set on the gateway.`);
  process.exit(1);
}

const method = action === "create" ? "POST" : action === "revoke" ? "DELETE" : "GET";
if (method !== "GET" && !address) {
  console.error(`"${action}" needs an address argument.`);
  process.exit(1);
}

const res = await fetch(`${endpoint}/v1/tokens`, {
  method,
  headers: {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  },
  ...(method === "GET" ? {} : { body: JSON.stringify({ address }) }),
});

const body: {
  error?: string;
  address?: string;
  token?: string;
  tokens?: unknown;
} = await res.json();
if (!res.ok) {
  console.error(`✗ ${res.status}:`, body.error ?? body);
  process.exit(1);
}

if (action === "create") {
  console.log(`Token for ${body.address} (shown once — store it now):\n`);
  console.log(body.token);
} else if (action === "revoke") {
  console.log(`✓ Token for ${address} revoked`);
} else {
  console.log(JSON.stringify(body.tokens, null, 2));
}
