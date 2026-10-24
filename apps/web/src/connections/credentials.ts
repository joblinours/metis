import "server-only";
import type { InstanceConfig } from "@/config";
import { getInstanceConfig } from "@/config/runtime";
import type { ProviderCreds } from "@/config/schema";
import { keysOf } from "@/lib/guards";

const ENV_PREFIX = {
  google: "GOOGLE",
  microsoft: "MICROSOFT",
  zoho: "ZOHO",
} as const;

export type OAuthProviderId = keyof typeof ENV_PREFIX;

export const OAUTH_PROVIDER_IDS = keysOf(ENV_PREFIX);

function oauthCreds(provider: OAuthProviderId, cfg: InstanceConfig): ProviderCreds {
  return cfg[provider];
}

const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

export function configuredOAuthProviders(
  cfg: InstanceConfig = getInstanceConfig(),
): OAuthProviderId[] {
  return OAUTH_PROVIDER_IDS.filter((provider) => {
    const { clientId, clientSecret } = oauthCreds(provider, cfg);
    const envPrefix = ENV_PREFIX[provider];

    if (clientId && clientSecret) return true;

    if (clientId) {
      warnOnce(`[connections] ignoring ${envPrefix} — ${envPrefix}_CLIENT_SECRET is missing.`);
    } else if (clientSecret) {
      warnOnce(`[connections] ignoring ${envPrefix} — ${envPrefix}_CLIENT_ID is missing.`);
    }
    return false;
  });
}

export function providerCredentials(
  provider: OAuthProviderId,
  cfg: InstanceConfig = getInstanceConfig(),
): {
  clientId: string;
  clientSecret: string;
} {
  const { clientId, clientSecret } = oauthCreds(provider, cfg);
  if (!clientId || !clientSecret) {
    const envPrefix = ENV_PREFIX[provider];
    throw new Error(
      `${provider} is not configured on this server — set ${envPrefix}_CLIENT_ID and ${envPrefix}_CLIENT_SECRET.`,
    );
  }
  return { clientId, clientSecret };
}
