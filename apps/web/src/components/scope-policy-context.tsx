"use client";

import { createContext, use } from "react";

import type { ScopePolicy } from "@/workspace/policy";

const FALLBACK: ScopePolicy = {
  workspaceAi: false,
  ai: false,
  phishingDetection: false,
};

const ScopePolicyContext = createContext<ScopePolicy>(FALLBACK);

export function ScopePolicyProvider({
  policy,
  children,
}: {
  policy: ScopePolicy;
  children: React.ReactNode;
}) {
  return <ScopePolicyContext.Provider value={policy}>{children}</ScopePolicyContext.Provider>;
}

export function useScopePolicy(): ScopePolicy {
  return use(ScopePolicyContext);
}
