import { cn } from "@metis/ui/lib/utils";

export function AuthInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-neutral-900 dark:focus:border-neutral-300 disabled:opacity-50",
        className,
      )}
    />
  );
}
