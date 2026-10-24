"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

export const REPO = "trymetis/metis";

const statsSchema = z
  .object({
    stars: z.number(),
    forks: z.number(),
    watchers: z.number(),
    open: z.number(),
    pushedAt: z.string(),
  })
  .nullable();
export type RepoStats = z.infer<typeof statsSchema>;

const cacheSchema = z.object({ at: z.number(), stats: statsSchema });

const githubRepoSchema = z.object({
  stargazers_count: z.number(),
  forks_count: z.number(),
  subscribers_count: z.number().optional(),
  open_issues_count: z.number(),
  pushed_at: z.string(),
});

const KEY = "metis:repo-stats";
const TTL = 10 * 60 * 1000;

let inflight: Promise<RepoStats> | null = null;
let cached: RepoStats | undefined;

function readCache(): RepoStats | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || Date.now() - parsed.data.at > TTL) return undefined;
    return parsed.data.stats;
  } catch {
    return undefined;
  }
}

function writeCache(stats: RepoStats) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), stats }));
  } catch {}
}

export function fetchRepoStats(): Promise<RepoStats> {
  if (cached !== undefined) return Promise.resolve(cached);
  const hit = readCache();
  if (hit !== undefined) {
    cached = hit;
    return Promise.resolve(hit);
  }
  if (!inflight) {
    inflight = fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const parsed = githubRepoSchema.safeParse(await r.json());
        if (!parsed.success) return null;
        const j = parsed.data;
        return {
          stars: j.stargazers_count,
          forks: j.forks_count,
          watchers: j.subscribers_count ?? 0,
          open: j.open_issues_count,
          pushedAt: j.pushed_at,
        };
      })
      .catch(() => null)
      .then((stats) => {
        cached = stats;
        writeCache(stats);
        inflight = null;
        return stats;
      });
  }
  return inflight;
}

export function useRepoStats() {
  const [stats, setStats] = useState<RepoStats | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchRepoStats().then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return stats;
}

export function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function ago(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  const days = Math.round(d / 86400);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}
