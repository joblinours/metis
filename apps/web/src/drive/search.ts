import "server-only";
import type { ParserAst } from "@/search/ast";
import type { FileKind } from "@/search/fields";
import { matcherFor, needsKey, type SearchDoc } from "@/search/match";
import type { DriveSourceError, TaggedDriveEntry } from "@/types/drive";

import {
  aggregateDriveSurface,
  type DriveSurface,
  type ResolvedDrive,
  splitCompositeId,
} from "./aggregate";
import { listDrivePins } from "./pins";

const DOCUMENT = new Set(["doc", "docx", "odt", "rtf", "pages"]);
const SPREADSHEET = new Set(["xls", "xlsx", "ods", "csv", "tsv", "numbers"]);
const PRESENTATION = new Set(["ppt", "pptx", "odp", "key"]);
const ARCHIVE = new Set(["zip", "gz", "tgz", "tar", "7z", "rar", "bz2", "xz"]);
const TEXT = new Set(["txt", "md", "json", "xml", "yaml", "yml", "log", "ini"]);

export interface FileSearchHit extends TaggedDriveEntry {
  ai?: boolean;
  pinned?: boolean;
  parentName?: string;
}

export interface FileSearchResult {
  entries: FileSearchHit[];
  cursor: string | null;
  driveErrors?: DriveSourceError[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function fileKinds(entry: Pick<TaggedDriveEntry, "kind" | "mimeType" | "name">): FileKind[] {
  if (entry.kind === "folder") return ["folder"];
  const mime = (entry.mimeType ?? "").toLowerCase();
  const ext = extensionOf(entry.name);
  const kinds: FileKind[] = ["file"];
  if (mime === "application/pdf" || ext === "pdf") kinds.push("pdf");
  if (mime.startsWith("image/")) kinds.push("image");
  if (mime.startsWith("video/")) kinds.push("video");
  if (mime.startsWith("audio/")) kinds.push("audio");
  if (
    DOCUMENT.has(ext) ||
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    mime === "application/vnd.google-apps.document"
  ) {
    kinds.push("document");
  }
  if (
    SPREADSHEET.has(ext) ||
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.google-apps.spreadsheet"
  ) {
    kinds.push("spreadsheet");
  }
  if (
    PRESENTATION.has(ext) ||
    mime.includes("presentationml") ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.google-apps.presentation"
  ) {
    kinds.push("presentation");
  }
  if (ARCHIVE.has(ext) || mime.includes("zip") || mime.includes("x-tar")) {
    kinds.push("archive");
  }
  if (TEXT.has(ext) || mime.startsWith("text/")) kinds.push("text");
  return kinds;
}

export function fileSearchDoc(
  entry: FileSearchHit,
  drive?: Pick<ResolvedDrive, "driveSlug" | "email">,
): SearchDoc {
  const modified = entry.modifiedAt ? new Date(entry.modifiedAt).getTime() : 0;
  return {
    type: "file",
    text: entry.name,
    name: entry.name,
    ext: extensionOf(entry.name),
    kind: fileKinds(entry),
    size: entry.size ?? 0,
    date: Number.isFinite(modified) ? modified : 0,
    "drive-folder": entry.parentName ?? "",
    is: entry.pinned ? ["pinned"] : [],
    drive: [drive?.driveSlug ?? entry.driveSlug, drive?.email ?? ""],
  };
}

function bareId(id: string): string {
  try {
    return splitCompositeId(id).fileId ?? id;
  } catch {
    return id;
  }
}

export async function searchFiles(
  userId: string,
  drives: ResolvedDrive[],
  query: ParserAst | boolean,
  opts: { cursor?: string; timeZone: string },
): Promise<FileSearchResult> {
  if (query === false || drives.length === 0) {
    return { entries: [], cursor: null };
  }
  const byId = new Map(drives.map((d) => [d.driveId, d]));
  const pins = await listDrivePins(userId, drives);
  const pinned = new Set(pins.map((p) => `${p.driveId}:${p.folderId}`));
  const surface: DriveSurface = aggregateDriveSurface(drives);
  const parentNames = new Map<string, string>();
  const parentLookups = new Map<string, Promise<string>>();

  const parentName = (entry: TaggedDriveEntry): Promise<string> => {
    const { parentId } = entry;
    if (!parentId) return Promise.resolve("");
    let pending = parentLookups.get(parentId);
    if (!pending) {
      pending = surface
        .getEntry(parentId)
        .then(
          (parent) => parent.name,
          () => "",
        )
        .then((name) => {
          parentNames.set(parentId, name);
          return name;
        });
      parentLookups.set(parentId, pending);
    }
    return pending;
  };

  const listing = await surface.searchAst({
    query,
    cursor: opts.cursor,
    timeZone: opts.timeZone,
    accept: async (residual, entries) => {
      if (!residual) return entries;
      const matcher = matcherFor(residual, opts.timeZone);
      const wantsParent = needsKey(residual, "drive-folder");
      const parents: (string | undefined)[] = wantsParent
        ? await Promise.all(entries.map((entry) => parentName(entry)))
        : [];
      return entries.filter((entry, i) => {
        const hit: FileSearchHit = {
          ...entry,
          pinned: pinned.has(`${entry.driveId}:${bareId(entry.id)}`),
          parentName: parents[i],
        };
        return matcher.matches(fileSearchDoc(hit, byId.get(entry.driveId)));
      });
    },
  });

  return {
    entries: listing.entries.map((entry) => ({
      ...entry,
      id: bareId(entry.id),
      parentId: entry.parentId ? bareId(entry.parentId) : null,
      ai: byId.get(entry.driveId)?.policy.ai ?? false,
      pinned: pinned.has(`${entry.driveId}:${bareId(entry.id)}`),
      parentName: entry.parentId ? parentNames.get(entry.parentId) : undefined,
    })),
    cursor: listing.cursor,
    driveErrors: listing.driveErrors,
  };
}
