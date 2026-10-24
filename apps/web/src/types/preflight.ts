export const PREFLIGHT_WARNING_KINDS = [
  "seed",
  "drift",
  "server",
  "llm",
  "decision",
  "quarantine",
] as const;
export type PreflightWarningKind = (typeof PREFLIGHT_WARNING_KINDS)[number];

export interface PreflightWarning {
  kind: PreflightWarningKind;
  message: string;
}

export const PREFLIGHT_WARNING_LABELS: Record<PreflightWarningKind, string> = {
  seed: "Seeding",
  drift: "Environment differs from the stored config",
  server: "Server checks",
  llm: "LLM",
  decision: "Decision model",
  quarantine: "Quarantine",
};
