import { SLOW_LOAD_MS } from "@metis/shell-core/navigation";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { MetisMark } from "@/components/metis-mark";
import { ScreenLinks } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import type { LoadingStatus } from "@/lib/shell";

function SlowLoadHint({ onRetry }: { onRetry: () => void }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!slow) return null;
  return (
    <View className="mt-6 w-full max-w-sm gap-3">
      <Text className="text-center text-sm text-muted-foreground">
        This is taking longer than usual.
      </Text>
      <Button size="lg" className="w-full" onPress={onRetry}>
        <Text>Try again</Text>
      </Button>
      <ScreenLinks changeServer />
    </View>
  );
}

export function LoadingScreen({ status, onRetry }: { status: LoadingStatus; onRetry: () => void }) {
  const muted = useCSSVariable("--color-muted-foreground");
  const [attempt, setAttempt] = useState(0);

  function retry() {
    setAttempt((count) => count + 1);
    onRetry();
  }

  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <View className="mb-6">
        <MetisMark />
      </View>
      <ActivityIndicator color={String(muted)} />
      <Text className="mt-4 text-sm text-muted-foreground">
        {status === "signing-in" ? "Signing you in…" : "Opening Metis Suite…"}
      </Text>
      <SlowLoadHint key={attempt} onRetry={retry} />
    </View>
  );
}
