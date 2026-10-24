import type { SummaryCard } from "@/mail/summary-catalog";

export interface ThreadSummary {
  cards: SummaryCard[];
  failedAt?: string;
  skipped?: boolean;
}
