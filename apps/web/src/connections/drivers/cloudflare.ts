import { cloudflareVerify } from "@/mail/providers/cloudflare";

import { createGatewayDriver } from "./gateway";

export const cloudflareDriver = createGatewayDriver({
  provider: "cloudflare",
  label: "Cloudflare Email",
  adminTokenHint:
    "That is the Worker's admin token — mint a mailbox token with token.ts and use that instead.",
  verify: cloudflareVerify,
});
