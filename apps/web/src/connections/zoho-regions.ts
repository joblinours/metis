import { getInstanceConfig } from "@/config/runtime";
import { ZOHO_REGIONS, type ZohoRegion } from "@/config/schema";

export type { ZohoRegion };

export function isZohoRegion(value: string): value is ZohoRegion {
  return (ZOHO_REGIONS as readonly string[]).includes(value);
}

export function zohoRegionOrder(): ZohoRegion[] {
  const configured = getInstanceConfig().zoho.region;
  return [configured, ...ZOHO_REGIONS.filter((r) => r !== configured)];
}
