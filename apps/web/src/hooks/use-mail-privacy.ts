"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo } from "react";

import { useMailImageProxy } from "@/components/mail-privacy-context";
import { imageProxyEndpoint, proxiedImageUrl } from "@/mail/render/frame";
import { type RenderedEmail, renderEmailHtml } from "@/mail/render/pipeline";
import type { RemoteImages } from "@/mail/render/types";
import { isSenderAllowed, remoteAllowQuery, useMailPrivacyStore } from "@/store/mail-privacy-store";

import { useUserPreferences } from "./use-preferences";

export function useMailPrivacy() {
  const prefs = useUserPreferences();
  const imageProxy = useMailImageProxy();
  const rules = useMailPrivacyStore((s) => s.rules);
  const allow = useQuery(remoteAllowQuery).data?.entries ?? null;
  const loadedOnce = useMailPrivacyStore((s) => s.loadedOnce);
  const ensureLoaded = useMailPrivacyStore((s) => s.ensureLoaded);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => ensureLoaded(), [ensureLoaded]);

  const origin = typeof window === "undefined" ? null : window.location.origin;
  const remoteContent = prefs?.mailRemoteContent ?? "block";
  const cleanLinks = prefs?.mailCleanLinks ?? true;
  const proxyOn = imageProxy && origin !== null;

  const imagesFor = useCallback(
    (sender: string, messageId: string): RemoteImages => {
      const loads =
        remoteContent === "load" || loadedOnce.has(messageId) || isSenderAllowed(sender, allow);
      if (!loads) return "block";
      return proxyOn ? "proxy" : "load";
    },
    [remoteContent, loadedOnce, allow, proxyOn],
  );

  const render = useCallback(
    (
      raw: string,
      purpose: "view" | "quote",
      images: RemoteImages = "block",
      themeOverride?: "light" | "dark",
    ): RenderedEmail | null => {
      if (!rules) return null;
      return renderEmailHtml(raw, {
        purpose,
        images,
        theme: themeOverride ?? theme,
        trackers: rules.trackers,
        links: cleanLinks ? rules.links : null,
        proxyUrl: proxyOn && origin ? (url) => proxiedImageUrl(origin, url) : null,
        ownOrigin: origin,
      });
    },
    [rules, cleanLinks, proxyOn, origin, theme],
  );

  return {
    ready: rules !== null,
    rules,
    cleanLinks,
    proxyEndpoint: proxyOn && origin ? imageProxyEndpoint(origin) : null,
    imagesFor,
    render,
  };
}

export type MailPrivacy = ReturnType<typeof useMailPrivacy>;

export function useRenderedEmail(
  privacy: MailPrivacy,
  raw: string | null,
  images: RemoteImages,
  purpose: "view" | "quote" = "view",
): RenderedEmail | null {
  const { render } = privacy;
  return useMemo(
    () => (raw === null ? null : render(raw, purpose, images)),
    [raw, purpose, images, render],
  );
}
