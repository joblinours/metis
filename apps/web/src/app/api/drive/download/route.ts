import { headers as nextHeaders } from "next/headers";

import { DriveNotVisibleError } from "@/drive/aggregate";
import { getDriveSession } from "@/drive/session";
import { failureStatus } from "@/lib/errors/provider-error";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { rateLimit, tooManyRequests } from "@/services/rate-limit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceSlug = searchParams.get("w");
  const driveSlug = searchParams.get("d");
  const fileId = searchParams.get("id");

  if (!workspaceSlug || !driveSlug || !fileId) {
    return Response.json({ error: "Missing parameters" }, { status: 400 });
  }

  const session = await getDriveSession(await nextHeaders(), workspaceSlug, driveSlug);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const rl = await rateLimit(session.userId, {
    scope: "drive-download",
    limit: 120,
    windowSec: 60,
  });
  if (!rl.ok) return tooManyRequests(rl);

  try {
    const target = await session.surface.getDownloadTarget(fileId);

    if (target.kind === "unavailable") {
      return Response.json({ error: target.reason, webUrl: target.webUrl }, { status: 409 });
    }

    return Response.redirect(target.url, 302);
  } catch (err) {
    if (err instanceof DriveNotVisibleError) {
      return Response.json({ error: err.clientMessage }, { status: 404 });
    }
    console.error("[drive-download]", err);
    return Response.json({ error: sanitizeError(err) }, { status: failureStatus(err) });
  }
}
