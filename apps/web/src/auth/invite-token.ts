import "server-only";
import crypto from "node:crypto";

const TOKEN_BYTES = 32;

export function newInviteToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
