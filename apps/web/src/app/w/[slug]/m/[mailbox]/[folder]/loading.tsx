const ROWS = Array.from({ length: 8 }, (_, i) => i);

export default function FolderLoading() {
  return (
    <div className="flex h-full flex-1 flex-col gap-3 overflow-hidden p-4" aria-busy="true">
      {ROWS.map((row) => (
        <div key={row} className="flex animate-pulse flex-col gap-2 py-1">
          <div className="h-3 w-1/3 rounded bg-hover" />
          <div className="h-3 w-2/3 rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}
