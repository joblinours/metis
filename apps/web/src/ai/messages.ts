import { safeValidateUIMessages, type UIMessage } from "ai";

export async function parseUIMessages(raw: unknown[] | undefined): Promise<UIMessage[] | null> {
  if (!raw || raw.length === 0) return [];
  const result = await safeValidateUIMessages({ messages: raw });
  return result.success ? result.data : null;
}
