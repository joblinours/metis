export const DRIVE_ENTRY_KINDS = ["file", "folder"] as const;
export type DriveEntryKind = (typeof DRIVE_ENTRY_KINDS)[number];

export interface DriveEntry {
  id: string;
  name: string;
  kind: DriveEntryKind;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
  parentId: string | null;
  webUrl: string | null;
  native: boolean;
}

export interface DriveListing {
  entries: DriveEntry[];
  cursor: string | null;
}

export interface TaggedDriveEntry extends DriveEntry {
  driveId: string;
  driveSlug: string;
}

export interface TaggedDriveListing {
  entries: TaggedDriveEntry[];
  cursor: string | null;
  driveErrors?: DriveSourceError[];
}

export interface DriveQuota {
  usedBytes: number | null;
  totalBytes: number | null;
}

export type DriveDownloadTarget =
  | {
      kind: "redirect";
      url: string;
      expiresAt: Date | null;
      name: string;
    }
  | {
      kind: "unavailable";
      reason: string;
      webUrl: string | null;
    };

export interface DriveStream {
  name: string;
  size: number | null;
  mimeType: string | null;
  body: ReadableStream<Uint8Array>;
  release(): void;
}

export const DRIVE_UPLOAD_STRATEGIES = ["resumable", "presigned-put"] as const;
export type DriveUploadStrategy = (typeof DRIVE_UPLOAD_STRATEGIES)[number];

export interface DriveUploadSession {
  strategy: DriveUploadStrategy;
  url: string;
  headers: Record<string, string>;
  chunkSize: number;
  authRequired: boolean;
}

export interface NewUpload {
  parentId: string | null;
  name: string;
  size: number;
  mime: string;
}

export interface DriveSourceError {
  driveId: string;
  driveSlug: string;
  email: string;
  message: string;
}
