import { z } from "zod";

import { keysOf } from "@/lib/guards";

import { type OAuthProviderId, providerCredentials } from "../credentials";
import {
  type AuthUrlContext,
  type CallbackParams,
  type ConnectionResource,
  type OAuthProfile,
  type OAuthProviderDriver,
  PROVIDER_RESOURCES,
  type RevokableToken,
  type TokenSet,
} from "../types";

const tokenResponseSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().optional(),
  scope: z.string().optional(),
  error: z.string().optional(),
});

export interface OAuthDriverOptions {
  provider: OAuthProviderId;
  label: string;
  mergesGrantedScopes: boolean;
  scopes: {
    base: string[];
    byResource: Record<ConnectionResource, string[]>;
    markers: Record<ConnectionResource, string>;
    separator?: string;
  };
  authorizeUrl: string | (() => string);
  tokenEndpoint: string | (() => string);
  authorizeParams: (ctx: AuthUrlContext) => Record<string, string>;
  sendScopeOnExchange?: boolean;
  exchangeTarget?: (params: CallbackParams) => {
    endpoint: string;
    meta?: Record<string, string>;
  };
  refreshEndpoints?: () => string[];
  getProfile: (token: TokenSet) => Promise<OAuthProfile>;
  revoke?: (token: RevokableToken) => Promise<void>;
}

export async function postForm(endpoint: string, body: Record<string, string>): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

function resolveUrl(value: string | (() => string)): string {
  return typeof value === "function" ? value() : value;
}

export function createOAuthDriver(options: OAuthDriverOptions): OAuthProviderDriver {
  const { provider, label, scopes } = options;
  const separator = scopes.separator ?? " ";
  const tokenEndpoint = () => resolveUrl(options.tokenEndpoint);

  function scopesFor(resources: ConnectionResource[]): string {
    return [...new Set([...scopes.base, ...resources.flatMap((r) => scopes.byResource[r])])].join(
      separator,
    );
  }

  return {
    kind: "oauth",
    provider,
    label,
    resources: [...PROVIDER_RESOURCES[provider]],
    mergesGrantedScopes: options.mergesGrantedScopes,
    get tokenEndpoint() {
      return tokenEndpoint();
    },

    grantedResources(scope) {
      if (!scope) return [];
      const lower = scope.toLowerCase();
      return keysOf(scopes.markers).filter((resource) => lower.includes(scopes.markers[resource]));
    },

    buildAuthUrl(ctx) {
      const url = new URL(resolveUrl(options.authorizeUrl));
      const params = {
        client_id: providerCredentials(provider).clientId,
        redirect_uri: ctx.redirectUri,
        response_type: "code",
        scope: scopesFor(ctx.resources),
        ...options.authorizeParams(ctx),
        state: ctx.state,
      };
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    },

    async exchangeCode(params) {
      const { clientId, clientSecret } = providerCredentials(provider);
      const scope = scopesFor(params.resources);
      const target = options.exchangeTarget?.(params) ?? {
        endpoint: tokenEndpoint(),
      };
      const res = await postForm(target.endpoint, {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
        code: params.code,
        ...(options.sendScopeOnExchange ? { scope } : {}),
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`${label} token exchange failed (${res.status}): ${body}`);
      }
      const data = tokenResponseSchema.parse(JSON.parse(body));
      if (data.error || !data.access_token) {
        throw new Error(`${label} token exchange error: ${data.error ?? "no access_token"}`);
      }
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresInSec: data.expires_in ?? null,
        scope: data.scope ?? scope,
        ...(target.meta ? { meta: target.meta } : {}),
      };
    },

    getProfile: options.getProfile,

    async refresh(refreshToken) {
      const { clientId, clientSecret } = providerCredentials(provider);
      const endpoints = options.refreshEndpoints?.() ?? [tokenEndpoint()];
      /* oxlint-disable eslint/no-await-in-loop -- tries each token endpoint in order and stops at the first that accepts the refresh token */
      for (const endpoint of endpoints) {
        try {
          const res = await postForm(endpoint, {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          });
          if (!res.ok) continue;
          const data = tokenResponseSchema.parse(await res.json());
          /* oxlint-enable eslint/no-await-in-loop */
          if (data.access_token) {
            return {
              accessToken: data.access_token,
              refreshToken: data.refresh_token ?? null,
              expiresInSec: data.expires_in ?? null,
              scope: data.scope ?? null,
            };
          }
        } catch {}
      }
      return null;
    },

    ...(options.revoke ? { revoke: options.revoke } : {}),
  };
}
