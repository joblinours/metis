import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

import { getInstanceConfig } from "@/config/runtime";

import { getWorkflowRunner } from "./registry";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function authorized(request: Request, secret: string): boolean {
  const provided = request.headers.get("X-Metis-Secret");
  if (!provided) return false;
  return timingSafeEqual(digest(provided), digest(secret));
}

const REJECTION_LOG_WINDOW_MS = 60_000;
const rejections = new Map<string, { at: number; suppressed: number }>();

function logRejection(reason: "secret-mismatch" | "secret-missing"): void {
  const now = Date.now();
  const last = rejections.get(reason);
  if (last && now - last.at < REJECTION_LOG_WINDOW_MS) {
    last.suppressed += 1;
    return;
  }
  rejections.set(reason, { at: now, suppressed: 0 });
  console.warn(
    `[workflow-runner] tick rejected reason=${reason} suppressedSinceLast=${last?.suppressed ?? 0}`,
  );
}

export async function handleTickRequest(request: Request): Promise<Response> {
  const runner = getInstanceConfig().workflowRunner;
  if (runner.driver !== "cron") {
    return new Response(null, { status: 404 });
  }
  if (!authorized(request, runner.secret)) {
    logRejection(request.headers.has("X-Metis-Secret") ? "secret-mismatch" : "secret-missing");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await getWorkflowRunner().tick({ signal: request.signal });

  return Response.json(summary, { status: summary.failure ? 500 : 200 });
}
