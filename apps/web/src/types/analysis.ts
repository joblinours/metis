export const CLASSIFICATIONS = ["Legitimate", "Suspicious", "Phishing"] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const ANALYSIS_ACTIONS = ["allow", "warn", "block"] as const;
export type AnalysisAction = (typeof ANALYSIS_ACTIONS)[number];

export interface AnalysisResult {
  classification: Classification;
  risk_score: number;
  confidence: number;
  action: AnalysisAction;
  reasons: string[];
  cached?: boolean;
}
