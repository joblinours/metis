import { Button } from "@metis/ui/components/button";
import { useState } from "react";

import type { OfflineReason } from "../../../src/settings-types";
import { mount, queryParam } from "../mount";
import { Screen, ScreenLinks, ScreenNote, useServer } from "../screen";

const COPY: Record<OfflineReason, { title: string; description: string }> = {
  offline: {
    title: "You're offline",
    description: "Metis Suite reconnects when your network comes back.",
  },
  unreachable: {
    title: "Can't reach the server",
    description: "Your network is up, but the server isn't answering. Try again in a moment.",
  },
};

function initialReason(): OfflineReason {
  return queryParam("reason") === "unreachable" ? "unreachable" : "offline";
}

function Offline() {
  const server = useServer();
  const [reason, setReason] = useState(initialReason);
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    setStatus("Checking…");
    const result = await window.metis.retryConnection();
    if (result?.ok) return;
    setReason(result?.reason === "unreachable" ? "unreachable" : "offline");
    setStatus("Still can't connect.");
    setChecking(false);
  }

  return (
    <Screen title={COPY[reason].title} description={COPY[reason].description} server={server}>
      <ScreenNote message={status} />
      <Button size="lg" className="mt-1 w-full" disabled={checking} onClick={() => void retry()}>
        Try again
      </Button>
      <ScreenLinks changeServer />
    </Screen>
  );
}

mount(<Offline />);
