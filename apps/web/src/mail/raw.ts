import "server-only";
import type { MailAdapter } from "./adapter";

export async function readRawMessage(adapter: MailAdapter, id: string): Promise<string> {
  const raw = await adapter.getRaw(id);
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return /^[A-Za-z-]+:/m.test(decoded) ? decoded : raw;
  } catch {
    return raw;
  }
}
