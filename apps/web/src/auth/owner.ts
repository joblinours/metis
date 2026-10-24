import "server-only";
import { config } from "@/config";

export function isOwnerEmail(email: string | null | undefined): boolean {
  const owner = config.app.ownerEmail;
  if (!owner || !email) return false;
  return email.trim().toLowerCase() === owner;
}
