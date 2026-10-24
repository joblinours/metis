import { router } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { MetisMark } from "@/components/metis-mark";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { changeServer } from "@/lib/shell";

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
    <View className="flex-1 bg-background pt-safe pb-safe">
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center p-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-sm">
          <View className="mb-8 items-center">
            <View className="mb-4">
              <MetisMark />
            </View>
            <Text className="text-center text-2xl font-semibold tracking-tight">{title}</Text>
            <Text className="mt-1.5 text-center text-sm text-muted-foreground">{description}</Text>
            {server ? (
              <Text className="mt-1 text-center font-mono text-xs text-muted-foreground">
                {server}
              </Text>
            ) : null}
          </View>
          <View className="gap-3">{children}</View>
        </View>
      </ScrollView>
    </View>
  );
}

export function ScreenLinks({ changeServer: showChangeServer }: { changeServer?: boolean }) {
  return (
    <View
      className={
        showChangeServer
          ? "mt-2 flex-row items-center justify-between"
          : "mt-2 flex-row items-center justify-end"
      }
    >
      {showChangeServer ? (
        <Button variant="link" size="sm" className="px-0" onPress={() => void changeServer()}>
          <Text className="text-xs text-muted-foreground">Use a different server</Text>
        </Button>
      ) : null}
      <Button variant="link" size="sm" className="px-0" onPress={() => router.push("/settings")}>
        <Text className="text-xs text-muted-foreground">Settings</Text>
      </Button>
    </View>
  );
}

export function ScreenError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="text-xs text-destructive-text">{message}</Text>;
}

export function ScreenNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text className="text-xs text-muted-foreground">{message}</Text>;
}
