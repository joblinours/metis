"use client";

import type { ChordBindings } from "@/hooks/use-chord";

export function ChordHint({
  prefix,
  bindings,
  visible,
}: {
  prefix: string;
  bindings: ChordBindings;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
      <div className="flex max-w-[90vw] items-center gap-3 rounded-full border border-border bg-popover px-4 py-2 shadow-md">
        <kbd className="inline-flex min-w-5.5 items-center justify-center rounded border border-border bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] text-primary">
          {prefix}
        </kbd>
        <span className="flex flex-wrap items-center gap-2.5">
          {Object.entries(bindings).map(([key, binding]) => (
            <span key={key} className="flex items-center gap-1">
              <kbd className="inline-flex min-w-5.5 items-center justify-center rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {key}
              </kbd>
              <span className="text-[11px] text-muted-foreground">{binding.label}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
