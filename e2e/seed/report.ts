import { env } from "../lib/env";

const rejected: { area: string; name: string; reason: string }[] = [];

export function reject(area: string, name: string, err: unknown): void {
  const reason = err instanceof Error ? err.message : String(err);
  rejected.push({ area, name, reason });
  console.warn(`[seed] ${area} rejected ${name}: ${reason}`);
}

export function rejections(): typeof rejected {
  return rejected;
}

export function edgeEnabled(): boolean {
  return env.edge;
}
