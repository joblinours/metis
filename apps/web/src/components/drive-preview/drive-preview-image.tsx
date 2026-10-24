"use client";

export function DrivePreviewImage({
  url,
  name,
  onFail,
}: {
  url: string;
  name: string;
  onFail: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      {/* oxlint-disable-next-line nextjs/no-img-element --a local blob: URL that next/image cannot optimise */}
      <img
        src={url}
        alt={name}
        onError={onFail}
        className="max-h-full max-w-full rounded-md object-contain"
      />
    </div>
  );
}
