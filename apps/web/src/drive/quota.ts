import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";

import { adapterForDrive, type ResolvedDrive } from "./aggregate";

export async function driveQuotas(drives: ResolvedDrive[]) {
  const results = await Promise.all(
    drives.map(async (account) => {
      try {
        const adapter = await adapterForDrive(account);
        const quota = await adapter.quota();
        return {
          quota: {
            driveId: account.driveId,
            driveSlug: account.driveSlug,
            email: account.email,
            provider: account.provider,
            usedBytes: quota?.usedBytes ?? null,
            totalBytes: quota?.totalBytes ?? null,
          },
        };
      } catch (err) {
        return {
          error: {
            driveId: account.driveId,
            driveSlug: account.driveSlug,
            email: account.email,
            message: sanitizeError(err),
          },
        };
      }
    }),
  );

  const quotas = results.flatMap((r) => (r.quota ? [r.quota] : []));
  const errors = results.flatMap((r) => (r.error ? [r.error] : []));
  return { quotas, driveErrors: errors.length ? errors : undefined };
}
