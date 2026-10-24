import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

import { app } from "electron";

const MAX_BYTES = 1024 * 1024;

export function logFile(): string {
  return path.join(app.getPath("logs"), "desktop.log");
}

function rotate(file: string): void {
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
  } catch {
    return;
  }
}

export function log(event: string, details: Record<string, unknown> = {}) {
  const fields = Object.entries(details)
    .map(([key, value]) => ` ${key}=${JSON.stringify(value)}`)
    .join("");
  const line = `${new Date().toISOString()} ${event}${fields}`;
  console.log(`[desktop] ${line}`);
  try {
    const file = logFile();
    mkdirSync(path.dirname(file), { recursive: true });
    rotate(file);
    appendFileSync(file, `${line}\n`);
  } catch {
    return;
  }
}

export function urlPath(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === "file:"
      ? `file:${path.basename(url.pathname)}`
      : `${url.origin}${url.pathname}`;
  } catch {
    return "invalid";
  }
}
