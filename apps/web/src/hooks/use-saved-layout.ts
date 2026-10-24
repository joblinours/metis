"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GroupImperativeHandle, Layout, LayoutChangedMeta } from "react-resizable-panels";
import { z } from "zod";

const layoutSchema = z.record(z.string(), z.number());

function storageKey(id: string, idsKey: string): string {
  return idsKey ? `${id}:${idsKey}` : id;
}

export function useSavedLayout(id: string, panelIds?: string[]) {
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const appliedKeyRef = useRef<string | null>(null);
  const idsKey = panelIds?.join(":") ?? "";
  const key = storageKey(id, idsKey);

  useEffect(() => {
    if (appliedKeyRef.current === key) return;
    appliedKeyRef.current = key;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    if (!raw) return;
    try {
      const layout = layoutSchema.safeParse(JSON.parse(raw));
      if (layout.success) groupRef.current?.setLayout(layout.data);
    } catch {}
  }, [key]);

  const onLayoutChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      if (!meta.isUserInteraction) return;
      if (idsKey) {
        const ids = idsKey.split(":");
        const layoutIds = Object.keys(layout);
        if (layoutIds.length !== ids.length || !ids.every((p) => p in layout)) {
          return;
        }
      }
      try {
        localStorage.setItem(key, JSON.stringify(layout));
      } catch {}
    },
    [key, idsKey],
  );

  return { groupRef, onLayoutChanged };
}
