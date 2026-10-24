export function mergeHeaders(base: Record<string, string>, overrides?: HeadersInit): Headers {
  const headers = new Headers(base);
  for (const [name, value] of new Headers(overrides)) {
    headers.set(name, value);
  }
  return headers;
}
