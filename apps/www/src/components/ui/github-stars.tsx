"use client";

import { Star } from "lucide-react";

import { compact, useRepoStats } from "@/lib/repo";
import { GITHUB_URL } from "@/lib/site";

import { GithubMark } from "./github-mark";

export function GithubStars({
  className = "",
  tone = "paper",
}: {
  className?: string;
  tone?: "paper" | "night";
}) {
  const stats = useRepoStats();
  const night = tone === "night";
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Metis Suite on GitHub"
      className={`inline-flex h-9 items-center overflow-hidden rounded-full border text-[13.5px] font-medium transition-colors ${
        night
          ? "border-white/15 text-bone hover:border-white/40"
          : "border-line text-ink hover:border-ink/40"
      } ${className}`}
    >
      <span className="inline-flex h-full items-center gap-2 pl-3.5 pr-3">
        <GithubMark className="size-4" />
        GitHub
      </span>
      <span
        className={`inline-flex h-full items-center gap-1.5 border-l pl-2.5 pr-3.5 ${night ? "border-white/15" : "border-line"}`}
      >
        <Star className="size-3.5 text-amber-glow" strokeWidth={2.25} fill="currentColor" />
        <span className="min-w-[2.2ch] font-[family-name:var(--font-mono)] text-[12.5px] tabular-nums">
          {stats === undefined ? "" : stats ? compact(stats.stars) : "Star"}
        </span>
      </span>
    </a>
  );
}
