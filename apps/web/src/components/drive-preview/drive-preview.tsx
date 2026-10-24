"use client";

import { Button } from "@metis/ui/components/button";
import { Download, ExternalLink, FileWarning, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { DriveIcon } from "@/components/drive-icon";
import { formatBytes } from "@/lib/utils";
import type { DriveEntryRow } from "@/server/schema";

import { DrivePreviewImage } from "./drive-preview-image";
import { DrivePreviewLoading } from "./drive-preview-loading";
import { DrivePreviewMarkdown } from "./drive-preview-markdown";
import { DrivePreviewAudio, DrivePreviewVideo } from "./drive-preview-media";
import { DrivePreviewTable } from "./drive-preview-table";
import { DrivePreviewText } from "./drive-preview-text";
import { DrivePreviewZip } from "./drive-preview-zip";
import { type DrivePreviewState, useDrivePreview } from "./use-drive-preview";

const DrivePreviewPdf = dynamic(
  () => import("./drive-preview-pdf").then((mod) => mod.DrivePreviewPdf),
  { ssr: false, loading: () => <DrivePreviewLoading /> },
);

function fallbackMessage(state: DrivePreviewState, failed: boolean): string {
  if (failed) return "This file can't be previewed here.";
  switch (state.status) {
    case "unsupported":
      return "There is no preview for this file type.";
    case "too-large":
      return `This file is over ${formatBytes(state.cap)}, too large to preview.`;
    case "failed":
      return state.message ?? "A preview isn't available for this file.";
    default:
      return "";
  }
}

function PreviewBody({
  entry,
  state,
  onFail,
}: {
  entry: DriveEntryRow;
  state: Extract<DrivePreviewState, { status: "ready" }>;
  onFail: () => void;
}) {
  switch (state.kind) {
    case "image":
      return <DrivePreviewImage url={state.url} name={entry.name} onFail={onFail} />;
    case "video":
      return <DrivePreviewVideo url={state.url} onFail={onFail} />;
    case "audio":
      return <DrivePreviewAudio url={state.url} name={entry.name} onFail={onFail} />;
    case "markdown":
      return <DrivePreviewMarkdown blob={state.blob} onFail={onFail} />;
    case "table":
      return <DrivePreviewTable blob={state.blob} name={entry.name} onFail={onFail} />;
    case "zip":
      return <DrivePreviewZip blob={state.blob} onFail={onFail} />;
    case "pdf":
      return <DrivePreviewPdf blob={state.blob} onFail={onFail} />;
    case "text":
      return <DrivePreviewText blob={state.blob} truncated={state.truncated} onFail={onFail} />;
  }
}

export function DrivePreview({
  entry,
  workspaceSlug,
  driveSlug,
  providerLabel,
  onClose,
  onDownload,
}: {
  entry: DriveEntryRow;
  workspaceSlug: string;
  driveSlug: string;
  providerLabel: string | null;
  onClose: () => void;
  onDownload: (entry: DriveEntryRow) => void;
}) {
  const state = useDrivePreview(entry, workspaceSlug, driveSlug);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);

  const save = () => {
    if (state.status !== "ready" || state.truncated) {
      onDownload(entry);
      return;
    }
    const link = document.createElement("a");
    link.href = state.url;
    link.download = entry.name;
    document.body.append(link);
    link.click();
    link.remove();
  };

  const webUrl = entry.webUrl;
  const openAtProvider = webUrl ? () => window.open(webUrl, "_blank") : null;
  const openLabel = providerLabel ? `Open in ${providerLabel}` : "Open";

  const actions = (
    <>
      <Button variant="outline" size="sm" onClick={save} aria-label="Download">
        <Download className="size-3.5" />
        <span data-action-label="" className="ml-1.5">
          Download
        </span>
      </Button>
      {openAtProvider && (
        <Button variant="ghost" size="sm" onClick={openAtProvider} aria-label={openLabel}>
          <ExternalLink className="size-3.5" />
          <span data-action-label="" className="ml-1.5">
            {openLabel}
          </span>
        </Button>
      )}
    </>
  );

  const meta = [
    entry.size === null ? null : formatBytes(entry.size),
    entry.modifiedAt
      ? new Date(entry.modifiedAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null,
  ].filter(Boolean);

  return (
    <aside
      aria-label={`Preview of ${entry.name}`}
      className="flex w-[min(52rem,50%)] min-w-80 shrink-0 flex-col border-l border-border bg-background max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:min-w-0 max-md:border-l-0"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2 max-md:[&_[data-action-label]]:hidden">
        <DriveIcon name={entry.name} kind={entry.kind} className="size-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground" title={entry.name}>
            {entry.name}
          </p>
          {meta.length > 0 && <p className="truncate text-[11px] text-faint">{meta.join(" · ")}</p>}
        </div>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label="Close preview" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {state.status === "ready" && state.truncated && !failed && (
        <div className="border-b border-border bg-panel px-4 py-1.5 text-[11px] text-muted-foreground">
          Truncated: only the first {formatBytes(state.blob.size)} is shown. Download the file to
          see all of it.
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {state.status === "loading" ? (
          <DrivePreviewLoading loaded={state.loaded} total={state.total} />
        ) : state.status === "ready" && !failed ? (
          <PreviewBody entry={entry} state={state} onFail={fail} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
            <FileWarning className="size-8 text-faint" />
            <p className="max-w-sm text-[13px] text-muted-foreground">
              {fallbackMessage(state, failed)}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">{actions}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
