import { cn } from "@metis/ui/lib/utils";
import { GitBranch } from "lucide-react";

import type { SourceInfo } from "@/source-info";

export function SourceLink({ source, className }: { source: SourceInfo; className?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-faint transition-colors hover:text-muted-foreground",
        className,
      )}
    >
      <GitBranch className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span>Source code</span>
      <span aria-hidden="true">·</span>
      <span className="font-mono">v{source.version}</span>
    </a>
  );
}
