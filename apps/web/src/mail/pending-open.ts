import { emailSchema } from "@/server/schema";
import type { Email } from "@/types/mail";

const KEY = "metis-pending-open-email";

let listener: ((email: Email) => boolean) | null = null;

export function stashPendingOpen(email: Email) {
  if (listener?.(email)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(email));
  } catch {}
}

export function takePendingOpen(): Email | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = emailSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function listenPendingOpen(handle: (email: Email) => boolean): () => void {
  listener = handle;
  return () => {
    if (listener === handle) listener = null;
  };
}
