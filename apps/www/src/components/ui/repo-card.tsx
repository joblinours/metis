"use client";

import { ArrowUpRight, Check, CircleDot, Copy, Eye, GitFork, Star } from "lucide-react";
import { useState } from "react";

import { ago, compact, REPO, useRepoStats } from "@/lib/repo";
import { GITHUB_URL } from "@/lib/site";

import { GithubMark } from "./github-mark";

const CLONE = `git clone ${GITHUB_URL}.git`;

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4">
      <span className="flex items-center gap-2 text-ink-3">
        {icon}
        <span className="label">{label}</span>
      </span>
      <span className="display text-[34px] tabular-nums text-ink">{value}</span>
    </div>
  );
}

export function RepoCard({ className = "" }: { className?: string }) {
  const stats = useRepoStats();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CLONE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  const dash = stats === undefined ? "" : "--";
  return (
    <div
      className={`overflow-hidden rounded-[28px] border border-line bg-surface text-ink shadow-[0_30px_60px_-40px_rgba(42,38,32,0.35)] ${className}`}
    >
      <div className="flex items-center justify-between gap-4 px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-panel">
            <GithubMark className="size-5" />
          </span>
          <div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-mono)] text-[14px] font-medium hover:underline"
            >
              {REPO}
            </a>
            <p className="mt-0.5 text-[12.5px] text-ink-3">AGPL-3.0 · TypeScript and Go</p>
          </div>
        </div>
        <span className="label rounded-full border border-line px-2.5 py-1 !text-[10.5px] text-ink-2">
          {stats?.pushedAt ? `Pushed ${ago(stats.pushedAt)}` : "Source"}
        </span>
      </div>
      <div className="grid grid-cols-2 border-y border-line sm:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-line">
        <Stat
          icon={<Star className="size-3.5" strokeWidth={2} />}
          value={stats ? compact(stats.stars) : dash}
          label="Stars"
        />
        <Stat
          icon={<GitFork className="size-3.5" strokeWidth={2} />}
          value={stats ? compact(stats.forks) : dash}
          label="Forks"
        />
        <Stat
          icon={<Eye className="size-3.5" strokeWidth={2} />}
          value={stats ? compact(stats.watchers) : dash}
          label="Watching"
        />
        <Stat
          icon={<CircleDot className="size-3.5" strokeWidth={2} />}
          value={stats ? compact(stats.open) : dash}
          label="Open"
        />
      </div>
      <div className="flex items-center gap-3 px-6 py-4">
        <code className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[13px] text-ink-2">
          $ {CLONE}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy clone command"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line transition-colors hover:border-ink/40"
        >
          {copied ? (
            <Check className="size-4 text-ok" strokeWidth={2.5} />
          ) : (
            <Copy className="size-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 px-6 pb-6">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-amber-glow px-5 text-[15px] font-medium text-[#1b1408] transition-colors hover:bg-[#d59e35]"
        >
          <Star className="size-4" strokeWidth={2} fill="currentColor" />
          Star on GitHub
        </a>
        <a
          href={`${GITHUB_URL}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-1 rounded-full border border-line px-5 text-[15px] font-medium transition-colors hover:border-ink/40"
        >
          Releases
          <ArrowUpRight className="size-4" strokeWidth={1.75} />
        </a>
      </div>
      {stats === null ? (
        <p className="border-t border-line px-6 py-3.5 text-[12.5px] text-ink-3">
          Live counts appear once the repository is public.
        </p>
      ) : null}
    </div>
  );
}
