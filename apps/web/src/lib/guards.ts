export function isOneOf<const T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmpty<T>(items: T[]): items is [T, ...T[]] {
  return items.length > 0;
}

export function keysOf<K extends string>(record: Partial<Record<K, unknown>>): K[] {
  return Object.keys(record).filter((key): key is K => key in record);
}
