import "server-only";
import addressparser from "addressparser";
import { decodeHTML } from "entities";
import libmime from "libmime";

import type { Recipient } from "@/types/mail";

function decodeWords(value: string): string {
  try {
    return libmime.decodeWords(value);
  } catch {
    return value;
  }
}

export function decodeMimeHeader(value: string | null | undefined): string {
  if (!value) return "";
  return decodeWords(value);
}

export function parseRecipientList(
  raw: string | null | undefined,
  opts?: { htmlEntities?: boolean },
): Recipient[] {
  if (!raw) return [];
  let input = raw;
  if (opts?.htmlEntities) input = decodeHTML(input);

  const out: Recipient[] = [];
  const walk = (entries: ReturnType<typeof addressparser>) => {
    for (const entry of entries) {
      if (entry.group) {
        walk(entry.group);
        continue;
      }
      const email = (entry.address ?? "").trim();
      if (!email) continue;
      const name = decodeWords(entry.name ?? "").trim();
      out.push({
        email,
        name: name && name.toLowerCase() !== email.toLowerCase() ? name : undefined,
      });
    }
  };

  try {
    walk(addressparser(input));
  } catch {
    return [];
  }
  return out;
}
