import "server-only";
import { sanitizeError } from "@/lib/errors/sanitize-error";
import { cacheAnalysis, getCachedAnalysis } from "@/mail/cache";
import { getPhishingDetection, phishingDetectionEnabled } from "@/services/phishing-detection";

import type { AgentMailbox } from "../runtime-context";

export async function analyzePhishing(args: {
  mailbox: AgentMailbox;
  userId: string;
  id: string;
  headers?: Headers;
}) {
  const { mailbox, userId, id, headers } = args;
  if (!phishingDetectionEnabled()) {
    return { id, error: "Phishing detection is disabled" };
  }
  try {
    const scoped = mailbox.scope(id);
    const cached = await getCachedAnalysis(scoped);
    if (cached) return { id, ...cached, cached: true };

    const rawB64 = await mailbox.adapter.getRaw(id);
    if (!rawB64) return { id, error: "No content to analyze" };

    const analysis = await getPhishingDetection().analyze({
      userId,
      rawMimeBase64: rawB64,
      headers,
    });
    await cacheAnalysis(scoped, analysis);
    return {
      id,
      classification: analysis.classification,
      risk_score: analysis.risk_score,
      confidence: analysis.confidence,
      action: analysis.action,
      reasons: analysis.reasons,
      cached: false,
    };
  } catch (err) {
    console.error("[agent-tool]", err);
    return { id, error: sanitizeError(err) };
  }
}
