import { cn } from "@metis/ui/lib/utils";

export function MetisMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      aria-label="Metis Suite"
      className={cn("size-12 rounded-2xl shadow-sm", className)}
    >
      <rect width="256" height="256" className="fill-neutral-900 dark:fill-white" />
      <path
        d="M128 127.5L49.25 193.751L49.25 61.2491L128 127.5Z"
        className="fill-white dark:fill-neutral-900"
      />
      <path
        d="M128 127.5L206.75 61.2491V193.751L128 127.5Z"
        className="fill-white dark:fill-neutral-900"
      />
    </svg>
  );
}
