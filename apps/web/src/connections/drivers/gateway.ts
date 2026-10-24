import type { CredentialProviderDriver, GatewayCredentials, GatewayProvider } from "../types";
import { createCredentialDriver } from "./credential";

interface GatewayDriverOptions {
  provider: GatewayProvider;
  label: string;
  adminTokenHint: string;
  verify(
    credentials: GatewayCredentials,
  ): Promise<{ domain: string | null; address: string | null }>;
}

export function createGatewayDriver(options: GatewayDriverOptions): CredentialProviderDriver {
  return createCredentialDriver({
    provider: options.provider,
    label: options.label,
    async verify(credentials, email) {
      const address = email.trim().toLowerCase();
      if (!address.endsWith(`@${credentials.domain}`)) {
        throw new Error(
          `This server only accepts @${credentials.domain} addresses for that mailbox provider.`,
        );
      }

      const { domain, address: tokenAddress } = await options.verify(credentials);
      if (domain && domain.toLowerCase() !== credentials.domain) {
        throw new Error(
          `That server serves @${domain}, but it is configured here for @${credentials.domain}.`,
        );
      }
      if (!tokenAddress) {
        throw new Error(options.adminTokenHint);
      }
      if (tokenAddress.toLowerCase() !== address) {
        throw new Error(`That token is scoped to ${tokenAddress}, not ${address}.`);
      }
    },
  });
}
