import { createHash } from "node:crypto";

const ADDRESS = /[^\s<>(),;:"']+@[^\s<>(),;:"']+/g;
const NO_SUBJECT = "(no subject)";

export function normalizeSubject(subject: string | undefined): string {
  const normalized = (subject ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return normalized === NO_SUBJECT ? "" : normalized;
}

export function addressSet(list: (string | undefined)[] | undefined): Set<string> {
  return new Set(
    (list ?? []).flatMap((entry) =>
      (entry?.match(ADDRESS) ?? []).map((address) => address.toLowerCase()),
    ),
  );
}

export function sendFingerprint(message: {
  subject?: string;
  to?: string[];
  cc?: string[];
}): string {
  const canonical = JSON.stringify([
    normalizeSubject(message.subject),
    [...addressSet(message.to)].toSorted(),
    [...addressSet(message.cc)].toSorted(),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
