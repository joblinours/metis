import { useState } from "react";

import { Screen, ScreenError, ScreenLinks, ScreenNote } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { signIn, useShell } from "@/lib/shell";

export function SignInScreen({ error: initialError }: { error: string | null }) {
  const server = useShell((state) => state.server);
  const [error, setError] = useState(initialError);
  const [waiting, setWaiting] = useState(false);
  const [lastInitial, setLastInitial] = useState(initialError);

  if (initialError !== lastInitial) {
    setLastInitial(initialError);
    setError(initialError);
    setWaiting(false);
  }

  async function start() {
    setError(null);
    setWaiting(true);
    await signIn();
  }

  return (
    <Screen
      title="Metis Suite"
      description="Sign in with your browser, then come back here"
      server={server}
    >
      <ScreenError message={error} />
      <ScreenNote
        message={
          waiting ? "Finish signing in in your browser. This screen updates on its own." : null
        }
      />
      <Button size="lg" className="mt-1 w-full" onPress={() => void start()}>
        <Text>{waiting ? "Open the browser again" : "Sign in with browser"}</Text>
      </Button>
      <ScreenLinks changeServer />
    </Screen>
  );
}
