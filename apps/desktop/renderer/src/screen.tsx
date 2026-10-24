import { Button } from "@metis/ui/components/button";
import { MetisMark } from "@metis/ui/components/metis-mark";
import { type ReactNode, useEffect, useState } from "react";

export function Screen({
  title,
  description,
  server,
  children,
}: {
  title: string;
  description: string;
  server?: string | null;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <MetisMark className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          {server ? <p className="mt-1 font-mono text-xs text-muted-foreground">{server}</p> : null}
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </main>
  );
}

export function ScreenLinks({ changeServer }: { changeServer?: boolean }) {
  return (
    <div
      className={
        changeServer
          ? "mt-2 flex items-center justify-between"
          : "mt-2 flex items-center justify-end"
      }
    >
      {changeServer ? (
        <Button
          variant="link"
          size="xs"
          className="px-0 text-muted-foreground"
          onClick={() => void window.metis.changeServer()}
        >
          Use a different server
        </Button>
      ) : null}
      <Button
        variant="link"
        size="xs"
        className="px-0 text-muted-foreground"
        onClick={() => void window.metis.openSettings()}
      >
        Settings
      </Button>
    </div>
  );
}

export function ScreenError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-destructive-text">{message}</p>;
}

export function ScreenNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs text-muted-foreground">{message}</p>;
}

export function useServer(): string | null {
  const [server, setServer] = useState<string | null>(null);
  useEffect(() => {
    void window.metis.info().then((info) => setServer(info?.server ?? null));
  }, []);
  return server;
}
