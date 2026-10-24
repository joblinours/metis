import { handleTickRequest } from "@/services/workflow-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleTickRequest(request);
}
