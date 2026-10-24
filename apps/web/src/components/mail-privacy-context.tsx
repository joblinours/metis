"use client";

import { createContext, use } from "react";

const ImageProxyContext = createContext(false);

export function MailImageProxyProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <ImageProxyContext.Provider value={enabled}>{children}</ImageProxyContext.Provider>;
}

export function useMailImageProxy(): boolean {
  return use(ImageProxyContext);
}
