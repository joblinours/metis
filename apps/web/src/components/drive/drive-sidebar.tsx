"use client";

import { Button } from "@metis/ui/components/button";
import { Progress } from "@metis/ui/components/progress";
import { Separator } from "@metis/ui/components/separator";
import { Clock, HardDrive, Pin, X } from "lucide-react";

import { formatBytes } from "@/lib/utils";
import type { DrivePin, DriveQuotaRow, WorkspaceDrive } from "@/server/schema";

import { DriveSwitcher } from "./drive-switcher";
import type { DriveRecent } from "./use-drive-recents";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 text-[10px] uppercase tracking-[1.5px] text-faint">{children}</div>
  );
}

export function DriveSidebar({
  drives,
  pins,
  recents,
  quota,
  onOpenFolder,
  onUnpin,
}: {
  drives: WorkspaceDrive[] | null;
  pins: DrivePin[];
  recents: DriveRecent[];
  quota: DriveQuotaRow | null;
  onOpenFolder: (id: string, name: string) => void;
  onUnpin: (pinId: string) => void;
}) {
  const used = quota?.usedBytes ?? null;
  const total = quota?.totalBytes ?? null;
  const percent = used !== null && total ? Math.min(100, (used / total) * 100) : null;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border p-3">
      <DriveSwitcher drives={drives} />

      {pins.length > 0 && (
        <div>
          <SectionLabel>Pinned</SectionLabel>
          <div className="flex flex-col">
            {pins.map((pin) => (
              <div key={pin.id} className="group flex items-center gap-1">
                <Button
                  variant="ghost"
                  className="h-8 min-w-0 flex-1 justify-start gap-2 px-2 text-[12px] font-normal"
                  onClick={() => onOpenFolder(pin.folderId, pin.label)}
                >
                  <Pin className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="truncate">{pin.label}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unpin ${pin.label}`}
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => onUnpin(pin.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recents.length > 0 && (
        <div>
          <SectionLabel>Recent</SectionLabel>
          <div className="flex flex-col">
            {recents.map((recent) => (
              <Button
                key={recent.id}
                variant="ghost"
                className="h-8 justify-start gap-2 px-2 text-[12px] font-normal"
                onClick={() => onOpenFolder(recent.id, recent.name)}
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
                <span className="truncate">{recent.name}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto">
        <Separator className="mb-3" />
        <div className="px-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
            {used === null ? (
              <span>Storage unavailable</span>
            ) : (
              <span>
                {formatBytes(used)}
                {total ? ` of ${formatBytes(total)}` : " used"}
              </span>
            )}
          </div>
          {percent !== null && <Progress value={percent} className="mt-2 gap-0" />}
        </div>
      </div>
    </aside>
  );
}
