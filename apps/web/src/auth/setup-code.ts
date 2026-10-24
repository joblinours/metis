import "server-only";
import crypto from "node:crypto";

import { config } from "@/config";

export function verifySetupCode(code: string): boolean {
  const expected = config.app.setupCode?.trim();
  if (!expected) return false;

  const provided = crypto.createHash("sha256").update(code.trim()).digest();
  const target = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(provided, target);
}
