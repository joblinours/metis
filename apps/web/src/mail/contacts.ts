import "server-only";
import { enforceRateLimit } from "@/services/rate-limit";
import type { Recipient } from "@/types/mail";

import type { MailAdapter } from "./adapter";

export interface ContactSuggestion {
  email: string;
  name?: string;
}

const CONTACTS_TTL_MS = 10 * 60 * 1000;
const CONTACTS_CACHE = new Map<string, { at: number; contacts: ContactSuggestion[] }>();

export async function suggestContacts(opts: {
  userId: string;
  mailboxIds: string[];
  adapter: MailAdapter;
}): Promise<ContactSuggestion[]> {
  const cacheKey = opts.mailboxIds.toSorted().join(",");
  const cached = CONTACTS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CONTACTS_TTL_MS) {
    return cached.contacts;
  }

  await enforceRateLimit(
    opts.userId,
    { scope: "mail-contacts", limit: 20, windowSec: 60 },
    "Too many requests. Please wait a moment.",
  );

  const [sent, inbox] = await Promise.all([
    opts.adapter.listMessages("sent", undefined, 50).catch(() => null),
    opts.adapter.listMessages("inbox", undefined, 50).catch(() => null),
  ]);

  const counts = new Map<string, { email: string; name?: string; count: number }>();
  const add = (rawEmail: string | undefined, name: string | undefined, weight: number) => {
    const email = (rawEmail ?? "").trim().toLowerCase();
    if (!email.includes("@")) return;
    const entry = counts.get(email) ?? {
      email,
      name: undefined as string | undefined,
      count: 0,
    };
    const trimmed = (name ?? "").trim();
    if (!entry.name && trimmed && trimmed.toLowerCase() !== email) {
      entry.name = trimmed;
    }
    entry.count += weight;
    counts.set(email, entry);
  };

  for (const e of sent?.emails ?? []) {
    const to = e.toRecipients ?? e.to.map((email): Recipient => ({ email }));
    const cc = e.ccRecipients ?? (e.cc ?? []).map((email): Recipient => ({ email }));
    for (const r of to) add(r.email, r.name, 2);
    for (const r of cc) add(r.email, r.name, 1);
  }
  for (const e of inbox?.emails ?? []) {
    add(e.from, e.fromName, 1);
  }

  const contacts = [...counts.values()]
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 200)
    .map(({ email, name }) => ({ email, name }));

  CONTACTS_CACHE.set(cacheKey, { at: Date.now(), contacts });
  return contacts;
}
