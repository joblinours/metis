import { MetisMark } from "@metis/ui/components/metis-mark";

export function NativeCard({
  title,
  body,
  children,
}: {
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white dark:bg-neutral-950 p-4">
      <div className="w-full max-w-sm text-center">
        <MetisMark className="mx-auto mb-4" />
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500">{body}</p>
        {children ? <div className="mt-6 flex flex-col gap-2">{children}</div> : null}
      </div>
    </main>
  );
}
