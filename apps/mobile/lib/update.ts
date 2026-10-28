import {
  fetchLatestVersion,
  isNewerVersion,
  latestFileUrl,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateStatus,
} from "@metis/shell-core/update";
import { nativeApplicationVersion } from "expo-application";
import { Alert, Linking, Platform } from "react-native";
import { create } from "zustand";

import { log } from "./log";
import { readSettings } from "./settings";
import { updateSettings } from "./shell";

const APK = "metis-suite-universal-linux-android.apk";

export const useUpdate = create<{ status: UpdateStatus }>(() => ({
  status: { state: "idle" },
}));

let running: Promise<UpdateStatus> | null = null;
let lastAttempt = 0;

export const updatesSupported = Platform.OS === "android";

export function downloadUpdate(): void {
  const url = latestFileUrl("mobile", APK);
  log("update download opened", { url });
  void Linking.openURL(url);
}

export function checkForUpdates(): Promise<UpdateStatus> {
  running ??= (async () => {
    lastAttempt = Date.now();
    useUpdate.setState({ status: { state: "checking" } });
    let status: UpdateStatus;
    try {
      const latest = await fetchLatestVersion("mobile");
      const current = nativeApplicationVersion ?? "";
      const checkedAt = Date.now();
      status = isNewerVersion(latest, current)
        ? { state: "available", version: latest, checkedAt }
        : { state: "current", checkedAt };
      log("update check", { latest, current });
    } catch (error) {
      status = { state: "failed", checkedAt: Date.now() };
      log("update check failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    useUpdate.setState({ status });
    return status;
  })().finally(() => {
    running = null;
  });
  return running;
}

export function markAnnounced(status: UpdateStatus): void {
  if (status.state !== "available") return;
  if (readSettings().announcedVersion === status.version) return;
  updateSettings({ announcedVersion: status.version });
}

function announce(status: UpdateStatus): void {
  if (status.state !== "available") return;
  if (readSettings().announcedVersion === status.version) return;
  markAnnounced(status);
  log("update announced", { version: status.version });
  Alert.alert(
    `Metis Suite ${status.version} is available`,
    "Download the new version to install it over this one.",
    [
      { text: "Later", style: "cancel" },
      { text: "Download", onPress: downloadUpdate },
    ],
  );
}

export async function checkForUpdatesIfDue(trigger: "start" | "resume"): Promise<void> {
  if (!updatesSupported || !readSettings().checkForUpdates) return;
  if (trigger === "resume" && Date.now() - lastAttempt < UPDATE_CHECK_INTERVAL_MS) return;
  announce(await checkForUpdates());
}
