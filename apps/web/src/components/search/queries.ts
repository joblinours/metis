export function quoteValue(value: string): string {
  return /^[\w.@+-]+$/.test(value) && !/^[-]/.test(value)
    ? value
    : `"${value.replaceAll('"', "")}"`;
}

export function qualifier(key: string, value: string): string {
  return `${key}:${quoteValue(value)}`;
}

export function personQuery(email: string): string {
  return ["from", "to", "attendee", "organizer"].map((key) => qualifier(key, email)).join(" OR ");
}

export function anyOf(key: string, values: string[]): string {
  const parts = values.map((value) => qualifier(key, value));
  return parts.length > 1 ? `(${parts.join(" OR ")})` : (parts[0] ?? "");
}
