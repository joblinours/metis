"use client";

import { createContext, use } from "react";

import type { ResolvedPolicy } from "@/workspace/policy";

const PlatformPolicyContext = createContext<ResolvedPolicy>({
  ai: false,
  phishingDetection: false,
});

export function PlatformPolicyProvider({
  policy,
  children,
}: {
  policy: ResolvedPolicy;
  children: React.ReactNode;
}) {
  return <PlatformPolicyContext.Provider value={policy}>{children}</PlatformPolicyContext.Provider>;
}

export function usePlatformPolicy(): ResolvedPolicy {
  return use(PlatformPolicyContext);
}
