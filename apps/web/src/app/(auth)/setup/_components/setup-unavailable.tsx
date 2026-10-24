export function SetupUnavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Not available
        </h2>
        <p className="mt-1.5 text-xs text-neutral-500">
          This page isn&apos;t available. If you administer this instance, check the server logs.
        </p>
      </div>
    </main>
  );
}
