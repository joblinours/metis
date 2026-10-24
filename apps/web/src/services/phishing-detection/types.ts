import type { AnalysisResult } from "@/types/analysis";

export type PhishingDetectionDriverKind = "metis" | "disabled";

export interface PhishingDetectionRequest {
  userId: string;
  rawMimeBase64: string;
  headers?: Headers;
}

export interface PhishingDetectionDriver {
  analyze(request: PhishingDetectionRequest): Promise<AnalysisResult>;
}
