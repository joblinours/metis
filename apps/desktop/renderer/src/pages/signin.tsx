import { Button } from "@metis/ui/components/button";
import { useState } from "react";

import { mount, queryParam } from "../mount";
import { Screen, ScreenError, ScreenLinks, ScreenNote, useServer } from "../screen";

function SignIn() {
  const server = useServer();
  const [error, setError] = useState(queryParam("error"));
  const [waiting, setWaiting] = useState(false);

  async function signIn() {
    setError(null);
    setWaiting(true);
    await window.metis.signIn();
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
          waiting ? "Finish signing in in your browser. This window updates on its own." : null
        }
      />
      <Button size="lg" className="mt-1 w-full" onClick={() => void signIn()}>
        {waiting ? "Open the browser again" : "Sign in with browser"}
      </Button>
      <ScreenLinks changeServer />
    </Screen>
  );
}

mount(<SignIn />);
