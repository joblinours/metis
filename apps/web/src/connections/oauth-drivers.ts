import type { OAuthProviderId } from "./credentials";
import { googleDriver } from "./drivers/google";
import { microsoftDriver } from "./drivers/microsoft";
import { zohoDriver } from "./drivers/zoho";
import type { OAuthProviderDriver } from "./types";

export const OAUTH_DRIVERS: Record<OAuthProviderId, OAuthProviderDriver> = {
  google: googleDriver,
  microsoft: microsoftDriver,
  zoho: zohoDriver,
};
