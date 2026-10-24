import "server-only";
import { ORPCError, os } from "@orpc/server";
import { headers } from "next/headers";

import { BadRequestError } from "@/lib/errors/bad-request";
import { NotVisibleError } from "@/lib/errors/not-visible";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { RateLimitedError } from "@/services/rate-limit";

const AUTHORED_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "TOO_MANY_REQUESTS",
]);

function toClientError(err: unknown, path: readonly string[]): unknown {
  if (err instanceof ORPCError && AUTHORED_CODES.has(err.code)) {
    return err;
  }
  if (err instanceof RateLimitedError) {
    return new ORPCError("TOO_MANY_REQUESTS", {
      message: err.message,
      data: { retryAfterSec: err.retryAfterSec },
    });
  }

  const cause = err instanceof ORPCError ? (err.cause ?? err) : err;
  if (cause instanceof NotVisibleError) {
    return new ORPCError("NOT_FOUND", { message: cause.clientMessage });
  }
  if (cause instanceof BadRequestError) {
    return new ORPCError("BAD_REQUEST", { message: cause.message });
  }
  console.error(`[orpc] ${path.join(".")} failed:`, cause);

  const code = err instanceof ORPCError ? err.code : "INTERNAL_SERVER_ERROR";
  return new ORPCError(code, { message: sanitizeError(cause, path), cause });
}

export const base = os.use(async ({ next, path }) => {
  try {
    return await next({
      context: {
        headers: await headers(),
      },
    });
  } catch (err) {
    throw toClientError(err, path);
  }
});
