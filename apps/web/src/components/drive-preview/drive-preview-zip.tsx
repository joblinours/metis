"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { unzipSync } from "fflate";
import { useEffect, useRef, useState } from "react";

import { formatBytes } from "@/lib/utils";

import { DrivePreviewLoading } from "./drive-preview-loading";

interface ZipEntry {
  name: string;
  size: number;
  compressed: number;
  folder: boolean;
}

const ROW_HEIGHT = 30;

function listZip(buffer: ArrayBuffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      entries.push({
        name: file.name,
        size: file.originalSize,
        compressed: file.size,
        folder: file.name.endsWith("/"),
      });
      return false;
    },
  });
  return entries;
}

export function DrivePreviewZip({ blob, onFail }: { blob: Blob; onFail: () => void }) {
  const [entries, setEntries] = useState<ZipEntry[] | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setEntries(null);
    blob
      .arrayBuffer()
      .then((buffer) => {
        if (active) setEntries(listZip(buffer));
      })
      .catch(() => active && onFail());
    return () => {
      active = false;
    };
  }, [blob, onFail]);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is used as documented; the React Compiler is not enabled
  const virtualizer = useVirtualizer({
    count: entries?.length ?? 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  if (entries === null) return <DrivePreviewLoading />;
  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[13px] text-faint">
        This archive is empty
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2 text-[11px] font-medium text-muted-foreground">
        <span className="min-w-0 flex-1">Name · {entries.length.toLocaleString()} entries</span>
        <span className="w-24 shrink-0 text-right">Size</span>
        <span className="w-24 shrink-0 text-right">Compressed</span>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index];
            if (!entry) return null;
            return (
              <div
                key={item.key}
                className="absolute inset-x-0 flex items-center gap-3 border-b border-border/60 px-4 text-[12px]"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <span
                  className="min-w-0 flex-1 truncate font-mono text-foreground"
                  title={entry.name}
                >
                  {entry.name}
                </span>
                <span className="w-24 shrink-0 text-right text-faint">
                  {entry.folder ? "—" : formatBytes(entry.size)}
                </span>
                <span className="w-24 shrink-0 text-right text-faint">
                  {entry.folder ? "—" : formatBytes(entry.compressed)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
