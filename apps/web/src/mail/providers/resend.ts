import type { GatewayCredentials } from "@/connections/types";

import { gatewayHealth, gatewayTarget } from "./gateway-client";

export async function resendVerify(
  credentials: GatewayCredentials,
): Promise<{ domain: string | null; address: string | null }> {
  const { backend, domain, address } = await gatewayHealth(
    gatewayTarget({ ...credentials, provider: "resend" }),
  );
  if (backend !== null && backend !== "resend") {
    throw new Error(
      `That endpoint is a ${backend} gateway, but it is configured here as a Resend one.`,
    );
  }
  return { domain, address };
}
