import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaListener } from "react-native-safe-area-context";
import { Uniwind, useCSSVariable, useUniwind } from "uniwind";

import { startShell } from "@/lib/lifecycle";

export default function RootLayout() {
  const { theme } = useUniwind();
  const background = useCSSVariable("--color-background");

  useEffect(() => {
    startShell();
  }, []);

  return (
    <SafeAreaListener style={{ flex: 1 }} onChange={({ insets }) => Uniwind.updateInsets(insets)}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: String(background) },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
      </Stack>
      <PortalHost />
    </SafeAreaListener>
  );
}
