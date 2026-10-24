export interface Cursor {
  date: string;
  id: string;
}

export function encodeCursor(date: string, id: string): string {
  return btoa(JSON.stringify([date, id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [date, id] = parsed;
    if (typeof date !== "string" || typeof id !== "string") return null;
    return { date, id };
  } catch {
    return null;
  }
}
