import { useState } from "react";

import { Screen, ScreenLinks, ScreenNote } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { OfflineReason } from "@/lib/settings-types";
import { reconnect, useShell } from "@/lib/shell";

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

export function OfflineScreen({ reason: initialReason }: { reason: OfflineReason }) {
  const server = useShell((state) => state.server);
  const [reason, setReason] = useState(initialReason);
  const [lastInitial, setLastInitial] = useState(initialReason);
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (initialReason !== lastInitial) {
    setLastInitial(initialReason);
    setReason(initialReason);
  }

  async function retry() {
    setChecking(true);
    setStatus("Checking…");
    const result = await reconnect("button");
    if (result.ok) return;
    setReason(result.reason === "unreachable" ? "unreachable" : "offline");
    setStatus("Still can't connect.");
    setChecking(false);
  }

  return (
    <Screen title={COPY[reason].title} description={COPY[reason].description} server={server}>
      <ScreenNote message={status} />
      <Button size="lg" className="mt-1 w-full" disabled={checking} onPress={() => void retry()}>
        <Text>Try again</Text>
      </Button>
      <ScreenLinks changeServer />
    </Screen>
  );
}
