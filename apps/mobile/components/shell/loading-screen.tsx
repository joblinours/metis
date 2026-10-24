import { ActivityIndicator, View } from "react-native";
import { useCSSVariable } from "uniwind";

import { MetisMark } from "@/components/metis-mark";
import { Text } from "@/components/ui/text";
import type { LoadingStatus } from "@/lib/shell";

export function LoadingScreen({ status }: { status: LoadingStatus }) {
  const muted = useCSSVariable("--color-muted-foreground");
  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <View className="mb-6">
        <MetisMark />
      </View>
      <ActivityIndicator color={String(muted)} />
      <Text className="mt-4 text-sm text-muted-foreground">
        {status === "signing-in" ? "Signing you in…" : "Opening Metis Suite…"}
      </Text>
    </View>
  );
}
