import { SLOW_LOAD_MS } from "@metis/shell-core/navigation";
import { Button } from "@metis/ui/components/button";
import { MetisMark } from "@metis/ui/components/metis-mark";
import { Spinner } from "@metis/ui/components/spinner";
import { useEffect, useState } from "react";

import { mount, queryParam } from "../mount";
import { ScreenLinks } from "../screen";

function SlowLoadHint({ onRetry }: { onRetry: () => void }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!slow) return null;
  return (
    <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
      <p className="text-center text-sm text-muted-foreground">This is taking longer than usual.</p>
      <Button size="lg" className="w-full" onClick={onRetry}>
        Try again
      </Button>
      <ScreenLinks changeServer />
    </div>
  );
}

function Loading() {
  const signingIn = queryParam("status") === "signing-in";
  const [attempt, setAttempt] = useState(0);

  function retry() {
    setAttempt((count) => count + 1);
    void window.metis.reopen();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <MetisMark className="mb-6" />
      <Spinner className="size-6 text-muted-foreground" />
      <p className="mt-4 text-sm text-muted-foreground">
        {signingIn ? "Signing you in…" : "Opening Metis Suite…"}
      </p>
      <SlowLoadHint key={attempt} onRetry={retry} />
    </main>
  );
}

mount(<Loading />);
