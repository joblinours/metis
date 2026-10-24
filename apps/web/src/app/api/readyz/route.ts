export const dynamic = "force-dynamic";

let lastError: string | null = null;

export async function GET() {
  try {
    const { databasesReady } = await import("@/db/readiness");
    await databasesReady();
    lastError = null;
    return new Response(null, { status: 200 });
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (text !== lastError) {
      lastError = text;
      console.warn(`[readyz] not ready: ${text}`);
    }
    return new Response(null, { status: 503 });
  }
}
