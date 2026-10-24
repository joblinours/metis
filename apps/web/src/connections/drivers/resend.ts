import { resendVerify } from "@/mail/providers/resend";

import { createGatewayDriver } from "./gateway";

export const resendDriver = createGatewayDriver({
  provider: "resend",
  label: "Resend",
  adminTokenHint:
    "That is the gateway's admin token — mint a mailbox token with token.ts and use that instead.",
  verify: resendVerify,
});
