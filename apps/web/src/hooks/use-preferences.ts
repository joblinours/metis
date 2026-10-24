"use client";

import { useQuery } from "@tanstack/react-query";

import { rpc } from "@/lib/orpc";
import { getQueryClient } from "@/lib/query-client";
import type { UserPreferences } from "@/server/schema";

const preferences = rpc.user.getPreferences;

export function updateCachedPreferences(prefs: UserPreferences) {
  getQueryClient().setQueryData(preferences.queryKey(), prefs);
}

export function cachedPreferences(): UserPreferences | null {
  return getQueryClient().getQueryData(preferences.queryKey()) ?? null;
}

export function useUserPreferences(): UserPreferences | null {
  return useQuery(preferences.queryOptions({ staleTime: Infinity })).data ?? null;
}
