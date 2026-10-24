"use client";

import { AudioLines } from "lucide-react";

export function DrivePreviewVideo({ url, onFail }: { url: string; onFail: () => void }) {
  return (
    <div className="flex h-full items-center justify-center bg-black/90 p-4">
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- previews a user's own file, which has no caption track */}
      <video
        src={url}
        controls
        preload="metadata"
        onError={onFail}
        className="max-h-full max-w-full"
      />
    </div>
  );
}

export function DrivePreviewAudio({
  url,
  name,
  onFail,
}: {
  url: string;
  name: string;
  onFail: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
      <AudioLines className="size-12 text-faint" />
      <p className="max-w-full truncate text-[13px] text-muted-foreground">{name}</p>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- previews a user's own file, which has no caption track */}
      <audio src={url} controls preload="metadata" onError={onFail} className="w-full max-w-md" />
    </div>
  );
}
