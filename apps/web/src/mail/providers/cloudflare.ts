import type { GatewayCredentials } from "@/connections/types";

import { gatewayHealth, gatewayTarget } from "./gateway-client";

export async function cloudflareVerify(
  credentials: GatewayCredentials,
): Promise<{ domain: string | null; address: string | null }> {
  const { domain, address } = await gatewayHealth(
    gatewayTarget({ ...credentials, provider: "cloudflare" }),
  );
  return { domain, address };
}
