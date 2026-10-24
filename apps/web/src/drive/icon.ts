import { isOneOf } from "@/lib/guards";

import {
  DRIVE_ICON_NAMES,
  type DriveIconName,
  FILE_EXTENSION_ICONS,
  FILE_NAME_ICONS,
  FOLDER_NAME_ICONS,
} from "./icons";

export function driveFileIconName(fileName: string): DriveIconName {
  const lower = fileName.trim().toLowerCase();
  const byName = FILE_NAME_ICONS[lower];
  if (byName) return byName;

  const parts = lower.split(".");
  for (let i = 1; i < parts.length; i += 1) {
    const byExtension = FILE_EXTENSION_ICONS[parts.slice(i).join(".")];
    if (byExtension) return byExtension;
  }

  return "_file";
}

export function driveFolderIconName(folderName: string, open = false): DriveIconName {
  const base = FOLDER_NAME_ICONS[folderName.trim().toLowerCase()] ?? "_folder";
  if (!open) return base;

  const opened = `${base}_open`;
  return isOneOf(DRIVE_ICON_NAMES, opened) ? opened : "_folder_open";
}
