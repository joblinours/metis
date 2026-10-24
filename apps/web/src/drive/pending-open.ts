import { type DriveEntryRow, driveEntrySchema } from "@/server/schema";

const KEY = "metis-pending-drive-preview";

let previewListener: ((entry: DriveEntryRow) => boolean) | null = null;

export function stashDrivePreview(entry: DriveEntryRow) {
  if (previewListener?.(entry)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entry));
  } catch {}
}

export function takeDrivePreview(driveSlug: string): DriveEntryRow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = driveEntrySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const entry = parsed.data;
    if (entry.driveSlug !== driveSlug) return null;
    sessionStorage.removeItem(KEY);
    return entry;
  } catch {
    return null;
  }
}

export function listenDrivePreviews(
  driveSlug: string,
  handle: (entry: DriveEntryRow) => void,
): () => void {
  const wrapped = (entry: DriveEntryRow) => {
    if (entry.driveSlug !== driveSlug) return false;
    handle(entry);
    return true;
  };
  previewListener = wrapped;
  return () => {
    if (previewListener === wrapped) previewListener = null;
  };
}

export type DriveHandoff = { kind: "upload"; files: File[] } | { kind: "folder" };

let pendingAction: DriveHandoff | null = null;
let actionListener: ((action: DriveHandoff) => void) | null = null;

export function stashDriveAction(action: DriveHandoff) {
  if (actionListener) {
    actionListener(action);
    return;
  }
  pendingAction = action;
}

export function listenDriveActions(handle: (action: DriveHandoff) => void): () => void {
  actionListener = handle;
  const waiting = pendingAction;
  pendingAction = null;
  if (waiting) handle(waiting);
  return () => {
    if (actionListener === handle) actionListener = null;
  };
}
