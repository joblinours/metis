import { handleInbound } from "@/workflow/inbound/handle";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await context.params;
  return handleInbound(request, endpoint);
}
