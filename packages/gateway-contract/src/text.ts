export const MAX_BODY_CHARS = 1_000_000;

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function snippetOf(
  text: string | null | undefined,
  html: string | null | undefined,
): string {
  const source =
    text && text.trim().length > 0
      ? text
      : (html ?? "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ");
  return source.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function truncate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_BODY_CHARS ? value.slice(0, MAX_BODY_CHARS) : value;
}

export function firstMessageId(references: string | null | undefined): string | null {
  const match = (references ?? "").match(/<[^<>]+>/);
  return match ? match[0] : null;
}

export function bracketMessageId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^<|>$/g, "");
  return bare ? `<${bare.slice(0, 996)}>` : null;
}

export function normalizeThreadKey(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

export function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}
