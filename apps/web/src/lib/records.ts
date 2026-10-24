export function recordOf<K extends string, V>(
  keys: readonly K[],
  value: (key: K) => V,
): Record<K, V> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every key in `keys` is assigned below; TypeScript cannot prove a record complete
  const out = {} as Record<K, V>;
  for (const key of keys) out[key] = value(key);
  return out;
}
