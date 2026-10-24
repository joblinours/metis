import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { getAuth } from "@/auth/server";

export function GET(request: Request) {
  return oauthProviderAuthServerMetadata(getAuth())(request);
}
