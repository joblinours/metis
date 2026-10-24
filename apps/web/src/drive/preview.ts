import type { DriveEntryKind } from "@/types/drive";

const MB = 1024 * 1024;

export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "markdown"
  | "table"
  | "zip"
  | "pdf"
  | "text";

const MEDIA_TYPES: Record<string, { kind: PreviewKind; type: string }> = {
  png: { kind: "image", type: "image/png" },
  jpg: { kind: "image", type: "image/jpeg" },
  jpeg: { kind: "image", type: "image/jpeg" },
  gif: { kind: "image", type: "image/gif" },
  webp: { kind: "image", type: "image/webp" },
  avif: { kind: "image", type: "image/avif" },
  apng: { kind: "image", type: "image/apng" },
  svg: { kind: "image", type: "image/svg+xml" },
  bmp: { kind: "image", type: "image/bmp" },
  ico: { kind: "image", type: "image/x-icon" },
  heic: { kind: "image", type: "image/heic" },
  heif: { kind: "image", type: "image/heif" },
  tif: { kind: "image", type: "image/tiff" },
  tiff: { kind: "image", type: "image/tiff" },
  jxl: { kind: "image", type: "image/jxl" },
  mp4: { kind: "video", type: "video/mp4" },
  m4v: { kind: "video", type: "video/mp4" },
  webm: { kind: "video", type: "video/webm" },
  mov: { kind: "video", type: "video/quicktime" },
  mkv: { kind: "video", type: "video/x-matroska" },
  ogv: { kind: "video", type: "video/ogg" },
  mp3: { kind: "audio", type: "audio/mpeg" },
  wav: { kind: "audio", type: "audio/wav" },
  ogg: { kind: "audio", type: "audio/ogg" },
  oga: { kind: "audio", type: "audio/ogg" },
  opus: { kind: "audio", type: "audio/ogg" },
  flac: { kind: "audio", type: "audio/flac" },
  m4a: { kind: "audio", type: "audio/mp4" },
  aac: { kind: "audio", type: "audio/aac" },
  weba: { kind: "audio", type: "audio/webm" },
};

const DOCUMENT_KINDS: Record<string, PreviewKind> = {
  md: "markdown",
  markdown: "markdown",
  csv: "table",
  tsv: "table",
  zip: "zip",
  pdf: "pdf",
};

const DOWNLOAD_ONLY = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "rtf",
  "gz",
  "tgz",
  "tar",
  "bz2",
  "tbz2",
  "xz",
  "txz",
  "zst",
  "7z",
  "rar",
  "lz",
  "lzma",
  "cab",
]);

export const PREVIEW_CAPS: Record<PreviewKind, number> = {
  image: 25 * MB,
  video: 200 * MB,
  audio: 200 * MB,
  markdown: 2 * MB,
  table: 20 * MB,
  zip: 100 * MB,
  pdf: 50 * MB,
  text: 2 * MB,
};

export const TABLE_ROW_LIMIT = 100_000;

export function fileExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

export function previewKind(entry: { name: string; kind: DriveEntryKind }): PreviewKind | null {
  if (entry.kind === "folder") return null;
  const extension = fileExtension(entry.name);
  if (extension === null) return "text";
  if (DOWNLOAD_ONLY.has(extension)) return null;
  return MEDIA_TYPES[extension]?.kind ?? DOCUMENT_KINDS[extension] ?? "text";
}

export function truncatesAtCap(kind: PreviewKind): boolean {
  return kind === "text";
}

export function previewBlobType(name: string, kind: PreviewKind): string {
  const media = MEDIA_TYPES[fileExtension(name) ?? ""];
  return media && media.kind === kind ? media.type : "application/octet-stream";
}

export function decodeUtf8(bytes: Uint8Array, truncated: boolean): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, {
      stream: truncated,
    });
  } catch {
    return null;
  }
}
