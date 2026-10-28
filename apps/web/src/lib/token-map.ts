export function readTokenMap(cursor: string | null): Record<string, string> {
  if (!cursor) return {};
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    );
  } catch {
    return {};
  }
}

export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  for (const key of ["statusCode", "status", "code"]) {
    const value = Reflect.get(err, key);
    if (typeof value === "number") return value;
  }
  return undefined;
}
