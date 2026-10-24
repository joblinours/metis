import "server-only";
import type { MetisPhishingDetectionConfig } from "@/config/schema";

import { analyzeEmail } from "../backend";
import type { PhishingDetectionDriver } from "../types";

export function createMetisDriver(cfg: MetisPhishingDetectionConfig): PhishingDetectionDriver {
  return {
    async analyze({ userId, rawMimeBase64, headers }) {
      const response = await analyzeEmail(
        cfg.backendUrl,
        {
          user_id: userId,
          raw_mime_base64: rawMimeBase64,
          source: "metis-suite",
          permissions: { analyze_body: true, analyze_attachments: true },
        },
        headers,
      );

      return {
        classification: response.classification,
        risk_score: response.risk_score,
        confidence: response.confidence,
        action: response.action,
        reasons: response.reasons,
        cached: response.cached,
      };
    },
  };
}
