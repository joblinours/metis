import { cn } from "@metis/ui/lib/utils";

import { driveFileIconName, driveFolderIconName } from "@/drive/icon";
import type { DriveEntryKind } from "@/types/drive";

interface DriveIconProps {
  name: string;
  kind: DriveEntryKind;
  open?: boolean;
  className?: string;
}

export function DriveIcon({ name, kind, open, className }: DriveIconProps) {
  const icon = kind === "folder" ? driveFolderIconName(name, open) : driveFileIconName(name);

  return (
    <span
      aria-hidden
      className={cn("drive-icon", className)}
      style={{
        "--drive-icon-light": `url("/drive-icons/latte/${icon}.svg")`,
        "--drive-icon-dark": `url("/drive-icons/mocha/${icon}.svg")`,
      }}
    />
  );
}
