"use client";

import { createContext, useContext } from "react";

import type { UnsubscribeStatus } from "@/types/mail";

export interface SummaryActions {
  snooze: (wakeAt: Date) => void;
  showEmail: (() => void) | null;
  unsubscribe: {
    available: boolean;
    status: UnsubscribeStatus | null;
    busy: boolean;
    run: () => void;
  };
}

const SummaryActionsContext = createContext<SummaryActions | null>(null);

export const SummaryActionsProvider = SummaryActionsContext.Provider;

export function useSummaryActions(): SummaryActions | null {
  return useContext(SummaryActionsContext);
}
