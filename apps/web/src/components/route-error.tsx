"use client";

import { Button } from "@metis/ui/components/button";
import { useEffect } from "react";

export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  const digest =
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <div className="flex h-full min-h-60 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">This page could not load.</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        A connected account or the server did not answer in time. Try again in a moment.
      </p>
      {digest && <p className="font-mono text-[11px] text-muted-foreground">Error {digest}</p>}
      <Button size="sm" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
