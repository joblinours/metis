"use client";

import { cn } from "@metis/ui/lib/utils";
import { Check } from "lucide-react";

import type { ThemeBrandId } from "@/theme/brand";

interface BrandPreviewCardProps {
  id: ThemeBrandId;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (id: ThemeBrandId) => void;
}

export function BrandPreviewCard({
  id,
  label,
  selected,
  disabled,
  onSelect,
}: BrandPreviewCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(id)}
      className={cn(
        "group rounded-xl border bg-surface p-3 text-left transition-all disabled:pointer-events-none disabled:opacity-60",
        selected
          ? "border-primary shadow-[0_0_0_1px_var(--brand)]"
          : "border-border hover:border-primary/60 hover:bg-hover/30",
      )}
    >
      <div
        className="brand-preview overflow-hidden rounded-lg border border-border bg-panel"
        data-brand={id}
      >
        <div className="flex items-center gap-1.5 border-border border-b bg-surface px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-(--red-dot)" />
          <span className="h-2 w-2 rounded-full bg-brand" />
          <span className="h-2 w-2 rounded-full bg-(--green-dot)" />
          <span className="ml-auto h-2 w-14 rounded-full bg-brand-soft" />
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-3 p-3">
          <div className="space-y-2">
            <div className="h-5 rounded bg-brand" />
            <div className="h-3 rounded bg-hover" />
            <div className="h-3 rounded bg-hover" />
            <div className="h-3 rounded bg-brand-soft" />
          </div>
          <div className="space-y-2">
            <div className="h-10 rounded-md bg-brand-soft" />
            <div className="h-3 w-3/4 rounded bg-hover" />
            <div className="h-3 w-1/2 rounded bg-hover" />
            <div className="mt-3 h-1.5 rounded-full bg-brand" />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-brand text-primary-foreground"
              : "border-border text-transparent group-hover:border-primary/60",
          )}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
      </div>
    </button>
  );
}
