import { createHash } from "node:crypto";

import { getInstanceConfig } from "@/config/runtime";
import { ZOHO_REGIONS, type ZohoRegion } from "@/config/schema";
import { getCache } from "@/services/cache";

export type { ZohoRegion };

const REGION_TTL_SEC = 24 * 60 * 60;
const LAST_REGION_KEY = "zoho:last-region";

const regionCache = new Map<string, ZohoRegion>();
let lastRegion: ZohoRegion | null = null;

export function isZohoRegion(value: string): value is ZohoRegion {
  return (ZOHO_REGIONS as readonly string[]).includes(value);
}

export function zohoRegionOrder(): ZohoRegion[] {
  const configured = getInstanceConfig().zoho.region;
  return [configured, ...ZOHO_REGIONS.filter((r) => r !== configured)];
}

async function probeOrder(): Promise<ZohoRegion[]> {
  const shared = lastRegion ?? (await getCache().get(LAST_REGION_KEY));
  const ordered = zohoRegionOrder();
  if (!shared || !isZohoRegion(shared) || shared === ordered[0]) return ordered;
  return [shared, ...ordered.filter((r) => r !== shared)];
}

export async function detectZohoRegion(
  accessToken: string,
  service: "mail" | "calendar",
  probeUrl: (region: ZohoRegion) => string,
): Promise<ZohoRegion> {
  const digest = createHash("sha256").update(accessToken).digest("base64url").slice(0, 32);
  const key = `zoho:${service}-region:${digest}`;

  const local = regionCache.get(key);
  if (local) return local;

  const shared = await getCache().get(key);
  if (shared && isZohoRegion(shared)) {
    regionCache.set(key, shared);
    return shared;
  }

  const errors: string[] = [];
  for (const region of await probeOrder()) {
    try {
      /* oxlint-disable eslint/no-await-in-loop -- probes each Zoho region in order and stops at the one that owns the account */
      const res = await fetch(probeUrl(region), {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        regionCache.set(key, region);
        lastRegion = region;
        await getCache().set(key, region, REGION_TTL_SEC);
        await getCache().set(LAST_REGION_KEY, region, REGION_TTL_SEC);
        /* oxlint-enable eslint/no-await-in-loop */
        return region;
      }
      console.log(`[zoho] ${service} region probe ${region} → ${res.status}`);
      errors.push(`${region}:${res.status}`);
    } catch (err) {
      errors.push(`${region}:${err instanceof Error ? err.message : "err"}`);
    }
  }
  throw new Error(`Could not detect the Zoho data center — tried: ${errors.join(", ")}`);
}
