"use client";

import { useEffect, useState } from "react";

import { decodeUtf8 } from "@/drive/preview";

import { DrivePreviewLoading } from "./drive-preview-loading";

export function DrivePreviewText({
  blob,
  truncated,
  onFail,
}: {
  blob: Blob;
  truncated: boolean;
  onFail: () => void;
}) {
  const [loaded, setLoaded] = useState<{ blob: Blob; truncated: boolean; text: string } | null>(
    null,
  );
  const text = loaded?.blob === blob && loaded.truncated === truncated ? loaded.text : null;

  useEffect(() => {
    let active = true;
    blob
      .arrayBuffer()
      .then((buffer) => {
        if (!active) return;
        const decoded = decodeUtf8(new Uint8Array(buffer), truncated);
        if (decoded === null) onFail();
        else setLoaded({ blob, truncated, text: decoded });
      })
      .catch(() => active && onFail());
    return () => {
      active = false;
    };
  }, [blob, truncated, onFail]);

  if (text === null) return <DrivePreviewLoading />;

  return (
    <div className="h-full overflow-auto">
      <pre className="min-w-fit p-4 font-mono text-[12px] leading-5 whitespace-pre text-foreground">
        {text}
      </pre>
    </div>
  );
}
