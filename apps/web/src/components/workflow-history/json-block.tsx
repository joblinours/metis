"use client";

import { cn } from "@metis/ui/lib/utils";
import { ChevronRight } from "lucide-react";

function pretty(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "";
  }
}

export function JsonBlock({
  label,
  value,
  open = false,
  className,
}: {
  label: string;
  value: unknown;
  open?: boolean;
  className?: string;
}) {
  const text = pretty(value);
  if (!text || text === "null") return null;
  return (
    <details
      open={open}
      className={cn("group/json rounded-md border border-border-soft", className)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 transition-transform group-open/json:rotate-90" />
        {label}
      </summary>
      <pre className="max-h-72 overflow-auto border-border-soft border-t px-2 py-1.5 font-mono text-[11px] text-foreground leading-snug">
        {text}
      </pre>
    </details>
  );
}
