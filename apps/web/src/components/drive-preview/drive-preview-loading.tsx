"use client";

import { Progress } from "@metis/ui/components/progress";
import { Loader2 } from "lucide-react";

import { formatBytes } from "@/lib/utils";

export function DrivePreviewLoading({ loaded, total }: { loaded?: number; total?: number | null }) {
  const known = total !== undefined && total !== null && total > 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
      <Loader2 className="size-4 animate-spin text-faint" />
      {loaded !== undefined && loaded > 0 && (
        <div className="flex w-56 flex-col gap-1.5">
          {known && <Progress value={Math.min(100, (loaded / total) * 100)} className="gap-0" />}
          <p className="text-center text-[11px] text-faint">
            {known ? `${formatBytes(loaded)} of ${formatBytes(total)}` : formatBytes(loaded)}
          </p>
        </div>
      )}
    </div>
  );
}
