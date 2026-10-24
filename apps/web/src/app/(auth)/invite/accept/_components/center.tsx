export function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
