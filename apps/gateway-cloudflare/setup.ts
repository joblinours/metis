import Cloudflare from "cloudflare";

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const workerName = process.env.WORKER_NAME ?? "metis-cf-mail";

if (!apiToken || !zoneId) {
  console.error(
    "Set CLOUDFLARE_API_TOKEN (Zone.Email Routing + Zone.DNS edit) and CLOUDFLARE_ZONE_ID.",
  );
  process.exit(1);
}

const client = new Cloudflare({ apiToken });

function fail(step: string, err: unknown): never {
  console.error(`✗ ${step}:`, err instanceof Error ? err.message : err);
  process.exit(1);
}

const zone = await client.zones.get({ zone_id: zoneId }).catch((err) => fail("resolve zone", err));
const domain = (process.env.MAIL_DOMAIN ?? zone.name).toLowerCase();
console.log(`Zone ${zoneId} → ${zone.name}, mail domain ${domain}`);

try {
  await client.emailRouting.enable({ zone_id: zoneId });
  console.log("✓ Email Routing enabled (MX + SPF records added)");
} catch (err) {
  if (err instanceof Error && /already|enabled/i.test(err.message)) {
    console.log("✓ Email Routing already enabled");
  } else {
    fail("enable Email Routing", err);
  }
}

const addresses = (process.env.MAIL_ADDRESSES ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

if (addresses.length > 0) {
  const existingLiterals = new Set<string>();
  try {
    for await (const rule of client.emailRouting.rules.list({
      zone_id: zoneId,
    })) {
      for (const matcher of rule.matchers ?? []) {
        if (matcher.type === "literal" && matcher.value) {
          existingLiterals.add(matcher.value.toLowerCase());
        }
      }
    }
  } catch (err) {
    fail("list routing rules", err);
  }

  for (const address of addresses) {
    if (existingLiterals.has(address)) {
      console.log(`✓ Routing rule for ${address} already present`);
      continue;
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- setup creates rules one at a time so its log and first failure read in address order
    await client.emailRouting.rules
      .create({
        zone_id: zoneId,
        name: `Metis Suite ${address}`,
        enabled: true,
        matchers: [{ type: "literal", field: "to", value: address }],
        actions: [{ type: "worker", value: [workerName] }],
      })
      .catch((err) => fail(`create routing rule for ${address}`, err));
    console.log(`✓ Routing rule ${address} → worker "${workerName}"`);
  }

  await client.emailRouting.rules.catchAlls
    .update({
      zone_id: zoneId,
      enabled: false,
      name: "Metis Suite catch-all (disabled)",
      matchers: [{ type: "all" }],
      actions: [{ type: "drop" }],
    })
    .catch((err) => fail("disable catch-all", err));
  console.log("✓ Catch-all disabled — mail for unlisted addresses is rejected at SMTP time");
} else {
  await client.emailRouting.rules.catchAlls
    .update({
      zone_id: zoneId,
      enabled: true,
      name: "Metis Suite catch-all",
      matchers: [{ type: "all" }],
      actions: [{ type: "worker", value: [workerName] }],
    })
    .catch((err) => fail("set catch-all → worker", err));
  console.log(
    `✓ Catch-all routes every incoming email to worker "${workerName}" (set MAIL_ADDRESSES to switch to per-address rules)`,
  );
}

let tag: string | null = null;
try {
  const created = await client.emailSending.subdomains.create({
    zone_id: zoneId,
    name: domain,
  });
  tag = created.tag;
  console.log(`✓ Email Sending enabled for ${domain} (tag ${tag})`);
} catch (err) {
  try {
    for await (const subdomain of client.emailSending.subdomains.list({
      zone_id: zoneId,
    })) {
      if (subdomain.name.toLowerCase() === domain) {
        tag = subdomain.tag;
        break;
      }
    }
  } catch {}
  if (tag) {
    console.log(`✓ Email Sending already enabled for ${domain} (tag ${tag})`);
  } else {
    fail("enable Email Sending (requires Workers Paid)", err);
  }
}

try {
  for await (const record of client.emailSending.subdomains.dns.get(tag, {
    zone_id: zoneId,
  })) {
    const { type, name, content, priority } = record;
    if (!type || !name || content === undefined) continue;

    let present = false;
    for await (const existing of client.dns.records.list({
      zone_id: zoneId,
      type,
      name: { exact: name },
    })) {
      if (existing.content === content) {
        present = true;
        break;
      }
    }
    if (present) {
      console.log(`✓ DNS ${type} ${name} already present`);
      continue;
    }

    await client.dns.records.create({
      zone_id: zoneId,
      type,
      name,
      content,
      ttl: 1,
      ...(priority !== undefined ? { priority } : {}),
    });
    console.log(`✓ DNS ${type} ${name} created`);
  }
} catch (err) {
  fail("create sending DNS records", err);
}

console.log(`
Done. Remaining one-time steps (see README.md):
  1. bun install && bun run db:create   → put the printed id in wrangler.jsonc
  2. bun run r2:create
  3. bun run db:apply
  4. Set MAIL_DOMAIN in wrangler.jsonc to ${domain}
  5. bun run secret                     → the ADMIN token (never given to users)
  6. bun run deploy
  7. ADMIN_TOKEN=... bun run token <worker URL> create you@${domain}
Then connect in Metis: Cloudflare Email → the workers.dev URL + that mailbox token.
`);
