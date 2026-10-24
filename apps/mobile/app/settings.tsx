import * as Application from "expo-application";
import Constants from "expo-constants";
import { router } from "expo-router";
import { shareAsync } from "expo-sharing";
import { Minus, Plus, X } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { logFile } from "@/lib/log";
import { clampTextZoom, MAX_TEXT_ZOOM, MIN_TEXT_ZOOM, TEXT_ZOOM_STEP } from "@/lib/settings";
import {
  changeServer,
  clearCache,
  resetApp,
  signOutAndRoute,
  updateSettings,
  useShell,
} from "@/lib/shell";

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-8">
      <Text className="text-2xl font-semibold tracking-tight">{title}</Text>
      <Text className="mt-1.5 text-sm text-muted-foreground">{description}</Text>
      <View className="mt-4 gap-4">{children}</View>
    </View>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-xl border border-border">{children}</View>;
}

function Row({
  title,
  description,
  first,
  children,
}: {
  title: string;
  description?: ReactNode;
  first?: boolean;
  children?: ReactNode;
}) {
  return (
    <View
      className={
        first
          ? "min-h-14 flex-row items-center justify-between gap-6 px-4 py-3"
          : "min-h-14 flex-row items-center justify-between gap-6 border-t border-border px-4 py-3"
      }
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium">{title}</Text>
        {typeof description === "string" ? (
          <Text className="mt-0.5 text-xs text-muted-foreground">{description}</Text>
        ) : (
          description
        )}
      </View>
      {children}
    </View>
  );
}

function ValueText({ children }: { children: ReactNode }) {
  return (
    <Text numberOfLines={1} className="mt-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </Text>
  );
}

function confirmReset() {
  Alert.alert(
    "Reset Metis Suite?",
    "This signs you out, forgets the server and restores every setting to its default.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          router.back();
          void resetApp();
        },
      },
    ],
  );
}

export default function SettingsScreen() {
  const settings = useShell((state) => state.settings);
  const server = useShell((state) => state.server);
  const [cacheStatus, setCacheStatus] = useState("Keeps you signed in.");

  async function onClearCache() {
    const cleared = await clearCache();
    setCacheStatus(cleared ? "Cache cleared." : "Could not clear the cache.");
  }

  function zoomBy(delta: number) {
    updateSettings({ textZoom: clampTextZoom(settings.textZoom + delta) });
  }

  const about = [
    ["Version", Application.nativeApplicationVersion ?? "unknown"],
    ["Build", Application.nativeBuildVersion ?? "unknown"],
    ["Expo SDK", Constants.expoConfig?.sdkVersion ?? "unknown"],
    ["Platform", `${Platform.OS} ${Platform.Version}`],
  ] as const;

  return (
    <View className="flex-1 bg-background pt-safe">
      <View className="h-12 flex-row items-center justify-between border-b border-border px-4">
        <Text className="text-lg font-semibold tracking-tight">Settings</Text>
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Close settings"
          onPress={() => router.back()}
        >
          <Icon as={X} className="size-5 text-muted-foreground" />
        </Button>
      </View>
      <ScrollView contentContainerClassName="px-4 py-6 pb-safe-offset-6">
        <Panel title="General" description="How Metis Suite opens on this device.">
          <Rows>
            <Row
              first
              title="Open where you left off"
              description="Reopens the last page you had open instead of your home workspace."
            >
              <Switch
                checked={settings.restoreLastPage}
                onCheckedChange={(next) => updateSettings({ restoreLastPage: next })}
              />
            </Row>
            {Platform.OS === "android" ? (
              <Row title="Text size" description={`${settings.textZoom}%`}>
                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    accessibilityLabel="Smaller text"
                    disabled={settings.textZoom <= MIN_TEXT_ZOOM}
                    onPress={() => zoomBy(-TEXT_ZOOM_STEP)}
                  >
                    <Icon as={Minus} className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    accessibilityLabel="Larger text"
                    disabled={settings.textZoom >= MAX_TEXT_ZOOM}
                    onPress={() => zoomBy(TEXT_ZOOM_STEP)}
                  >
                    <Icon as={Plus} className="size-4" />
                  </Button>
                </View>
              </Row>
            ) : null}
          </Rows>
        </Panel>

        <Panel title="Server" description="The Metis instance this app opens.">
          <Rows>
            <Row first title="Address" description={<ValueText>{server ?? "No server"}</ValueText>}>
              <Button
                variant="outline"
                onPress={() => {
                  router.back();
                  void changeServer();
                }}
              >
                <Text>Change server…</Text>
              </Button>
            </Row>
            <Row title="Sign out" description="Signs this app out. Your browser stays signed in.">
              <Button
                variant="outline"
                onPress={() => {
                  router.back();
                  void signOutAndRoute();
                }}
              >
                <Text>Sign out</Text>
              </Button>
            </Row>
          </Rows>
        </Panel>

        <Panel title="Advanced" description="Troubleshooting for this app on this device.">
          <Rows>
            <Row first title="Clear cache" description={cacheStatus}>
              <Button variant="outline" onPress={() => void onClearCache()}>
                <Text>Clear</Text>
              </Button>
            </Row>
            <Row
              title="Reset the app"
              description="Signs out, forgets the server and restores default settings."
            >
              <Button variant="outline" onPress={confirmReset}>
                <Text className="text-destructive-text">Reset…</Text>
              </Button>
            </Row>
          </Rows>
        </Panel>

        <Panel title="About" description="Versions and logs for bug reports.">
          <Rows>
            {about.map(([label, value], index) => (
              <View
                key={label}
                className={
                  index === 0
                    ? "min-h-11 flex-row items-center justify-between gap-6 px-4 py-2.5"
                    : "min-h-11 flex-row items-center justify-between gap-6 border-t border-border px-4 py-2.5"
                }
              >
                <Text className="text-sm text-muted-foreground">{label}</Text>
                <Text className="font-mono text-sm">{value}</Text>
              </View>
            ))}
          </Rows>
          <Rows>
            <Row first title="Log file" description="Share it with a bug report.">
              <Button
                variant="outline"
                onPress={() => {
                  const file = logFile();
                  if (file.exists) void shareAsync(file.uri);
                }}
              >
                <Text>Share</Text>
              </Button>
            </Row>
          </Rows>
        </Panel>
      </ScrollView>
    </View>
  );
}
