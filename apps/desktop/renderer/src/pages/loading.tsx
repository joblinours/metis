import { MetisMark } from "@metis/ui/components/metis-mark";
import { Spinner } from "@metis/ui/components/spinner";

import { mount, queryParam } from "../mount";

function Loading() {
  const signingIn = queryParam("status") === "signing-in";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <MetisMark className="mb-6" />
      <Spinner className="size-6 text-muted-foreground" />
      <p className="mt-4 text-sm text-muted-foreground">
        {signingIn ? "Signing you in…" : "Opening Metis Suite…"}
      </p>
    </main>
  );
}

mount(<Loading />);
