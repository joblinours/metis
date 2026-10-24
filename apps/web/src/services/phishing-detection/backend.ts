import { headers as nextHeaders } from "next/headers";
import { z } from "zod";

import { mintBackendToken } from "@/auth/backend-token";
import { getAuth } from "@/auth/server";
import { ANALYSIS_ACTIONS, CLASSIFICATIONS } from "@/types/analysis";

async function sessionToken(passedHeaders?: Headers): Promise<string | null> {
  try {
    const h = passedHeaders ?? (await nextHeaders());
    const result = await getAuth().api.getToken({ headers: h });
    return result?.token ?? null;
  } catch {
    return null;
  }
}

async function backendToken(
  userId: string | undefined,
  passedHeaders?: Headers,
): Promise<string | null> {
  const fromSession = await sessionToken(passedHeaders);
  if (fromSession) return fromSession;
  return userId ? mintBackendToken(userId) : null;
}

export interface EmailAnalysisRequest {
  user_id?: string;
  raw_mime_base64: string;
  source?: string;
  permissions?: {
    analyze_body: boolean;
    analyze_attachments: boolean;
  };
}

const emailAnalysisResponseSchema = z.object({
  user_id: z.string(),
  email_id: z.string(),
  risk_score: z.number(),
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number(),
  action: z.enum(ANALYSIS_ACTIONS),
  reasons: z.array(z.string()),
  cached: z.boolean(),
  timestamp: z.string(),
  processing_time_ms: z.number(),
  layer_results: z.unknown().optional(),
});

export type EmailAnalysisResponse = z.infer<typeof emailAnalysisResponseSchema>;

export async function analyzeEmail(
  baseUrl: string,
  body: EmailAnalysisRequest,
  passedHeaders?: Headers,
): Promise<EmailAnalysisResponse> {
  const token = await backendToken(body.user_id, passedHeaders);
  if (!token) throw new Error("Failed to issue auth token for backend");

  const res = await fetch(`${baseUrl}/api/v1/email/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      user_id: body.user_id ?? "",
      raw_mime_base64: body.raw_mime_base64,
      source: body.source ?? "metis-suite",
      permissions: body.permissions ?? {
        analyze_body: true,
        analyze_attachments: true,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${text}`);
  }

  return emailAnalysisResponseSchema.parse(await res.json());
}
