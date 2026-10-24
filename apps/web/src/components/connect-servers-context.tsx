"use client";

import { createContext, use } from "react";

import type { ConnectServer } from "@/connections/types";

const ConnectServersContext = createContext<readonly ConnectServer[]>([]);

export function ConnectServersProvider({
  servers,
  children,
}: {
  servers: readonly ConnectServer[];
  children: React.ReactNode;
}) {
  return (
    <ConnectServersContext.Provider value={servers}>{children}</ConnectServersContext.Provider>
  );
}

export function useConnectServers(): readonly ConnectServer[] {
  return use(ConnectServersContext);
}
