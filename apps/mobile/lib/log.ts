import { File, Paths } from "expo-file-system";

const MAX_BYTES = 1024 * 1024;

let pending: Promise<void> = Promise.resolve();

export function logFile(): File {
  return new File(Paths.document, "mobile.log");
}

async function append(line: string): Promise<void> {
  const current = logFile();
  if (current.exists && current.size > MAX_BYTES) {
    const previous = new File(Paths.document, "mobile.log.1");
    if (previous.exists) previous.delete();
    await current.move(previous);
  }
  const target = logFile();
  if (!target.exists) target.create();
  await target.write(`${line}\n`, { append: true });
}

export function log(event: string, details: Record<string, unknown> = {}) {
  const fields = Object.entries(details)
    .map(([key, value]) => ` ${key}=${JSON.stringify(value)}`)
    .join("");
  const line = `${new Date().toISOString()} ${event}${fields}`;
  console.log(`[mobile] ${line}`);
  pending = pending.then(() => append(line)).catch(() => undefined);
}

export function urlPath(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid";
  }
}
