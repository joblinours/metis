export function MetisMark({
  className = "size-8",
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "bone";
}) {
  const ink = tone === "ink";
  const glyph = ink ? "white" : "black";
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={className}>
      <rect width="256" height="256" fill={ink ? "black" : "#f4efe2"} />
      <path d="M128 127.5L49.25 193.751L49.25 61.2491L128 127.5Z" fill={glyph} />
      <path d="M128 127.5L206.75 61.2491V193.751L128 127.5Z" fill={glyph} />
    </svg>
  );
}
