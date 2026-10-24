import { statusOf } from "@/lib/errors/provider-error";
import { sanitizeError } from "@/lib/errors/sanitize-error";

const RATE_LIMITED = /\b429\b|\btoo many requests\b|\brate[ -]?limit/;
const UNAUTHORIZED = /\b401\b|\bunauthorized\b|\bapi key\b/;

function httpStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error as { statusCode?: unknown };
    if (typeof statusCode === "number") return statusCode;
  }
  return statusOf(error);
}

export function mapStreamError(error: unknown): string {
  console.error("[ai-stream]", error);

  const status = httpStatus(error);
  const raw = (error instanceof Error ? error.message : String(error)).toLowerCase();

  if (status === 429 || RATE_LIMITED.test(raw)) {
    return "The assistant is busy right now. Wait a moment and try again.";
  }
  if (status === 401 || UNAUTHORIZED.test(raw)) {
    return "The assistant is unavailable right now. Try again later.";
  }

  return sanitizeError(error);
}
