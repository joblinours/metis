import "server-only";
import { APIError } from "better-auth/api";

import { getInstanceConfig } from "@/config/runtime";
import { db } from "@/db";
import { legalConsent } from "@/db/schema";

const LEGAL_CONSENT_HEADER = "x-legal-consent";

export type LegalConfig = {
  termsUrl: string | null;
  privacyUrl: string | null;
  version: string;
};

export function legalConfig(): LegalConfig | null {
  const legal = getInstanceConfig().legal;
  if (!legal.termsUrl && !legal.privacyUrl) return null;
  return {
    termsUrl: legal.termsUrl ?? null,
    privacyUrl: legal.privacyUrl ?? null,
    version: legal.version,
  };
}

function legalConsentMessage(legal: LegalConfig): string {
  if (legal.termsUrl && legal.privacyUrl) {
    return "Agree to the terms of service and privacy policy to create an account";
  }
  if (legal.privacyUrl) {
    return "Agree to the privacy policy to create an account";
  }
  return "Agree to the terms of service to create an account";
}

export function enforceLegalConsent(headers: Headers | undefined) {
  const legal = legalConfig();
  if (!legal) return;

  const provided = headers?.get(LEGAL_CONSENT_HEADER)?.trim() ?? "";
  if (provided !== legal.version) {
    throw APIError.from("BAD_REQUEST", {
      code: "LEGAL_CONSENT_REQUIRED",
      message: provided
        ? "The terms have been updated. Refresh the page and agree again."
        : legalConsentMessage(legal),
    });
  }
}

export async function attachLegalConsent(
  userId: string,
  email: string,
  headers: Headers | undefined,
) {
  const legal = legalConfig();
  if (!legal) return;

  const provided = headers?.get(LEGAL_CONSENT_HEADER)?.trim() ?? "";
  if (provided !== legal.version) return;

  await db.insert(legalConsent).values({
    id: crypto.randomUUID(),
    userId,
    email: email.toLowerCase(),
    termsUrl: legal.termsUrl,
    privacyUrl: legal.privacyUrl,
    version: legal.version,
    consentedAt: new Date(),
  });
}
