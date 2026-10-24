import crypto from "node:crypto";

import {
  type ConnectionCredentials,
  type CredentialProvider,
  type CredentialProviderDriver,
  credentialResourceFor,
} from "../types";

type CredentialsFor<P extends CredentialProvider> = Extract<ConnectionCredentials, { provider: P }>;

interface CredentialDriverOptions<P extends CredentialProvider> {
  provider: P;
  label: string;
  verify(credentials: CredentialsFor<P>, email: string): Promise<void>;
  accountKey?(credentials: CredentialsFor<P>, email: string): string;
}

function isCredentialsFor<P extends CredentialProvider>(
  credentials: ConnectionCredentials,
  provider: P,
): credentials is CredentialsFor<P> {
  return credentials.provider === provider;
}

export function credentialAccountId(key: string, server: string): string {
  return crypto
    .createHash("sha256")
    .update(`${key.trim().toLowerCase()}|${server.trim().toLowerCase()}`)
    .digest("hex");
}

export function createCredentialDriver<P extends CredentialProvider>(
  options: CredentialDriverOptions<P>,
): CredentialProviderDriver {
  const { provider, label } = options;
  const resource = credentialResourceFor(provider);
  return {
    kind: "credentials",
    provider,
    label,
    resources: [resource],

    grantedResources(scope) {
      return scope?.includes(resource) ? [resource] : [];
    },

    async verify(credentials, email) {
      if (!isCredentialsFor(credentials, provider)) {
        throw new Error(`Expected ${label} credentials`);
      }
      await options.verify(credentials, email);
      const key = options.accountKey?.(credentials, email) ?? email;
      return {
        providerAccountId: credentialAccountId(key, credentials.server),
        email,
        image: null,
      };
    },
  };
}
