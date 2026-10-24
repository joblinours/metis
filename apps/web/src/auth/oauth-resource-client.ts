import "server-only";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

import { getAuth } from "./server";

export function getProtectedResourceMetadata(overrides: {
  resource: string;
  authorization_servers: string[];
}) {
  return oauthProviderResourceClient(getAuth())
    .getActions()
    .getProtectedResourceMetadata(overrides);
}
