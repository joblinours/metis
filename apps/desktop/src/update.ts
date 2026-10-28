import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DOWNLOAD_PAGE,
  fetchLatestVersion,
  isNewerVersion,
  latestFileUrl,
  UPDATE_CHECK_INTERVAL_MS,
  type UpdateStatus,
} from "@metis/shell-core/update";
import { app, net, Notification, shell } from "electron";

import { log } from "./log";
import { readSettings, writeSettings } from "./settings";

const TICK_MS = 60 * 60 * 1000;
const CPU: Partial<Record<NodeJS.Architecture, string>> = { x64: "x86_64", arm64: "aarch64" };

let status: UpdateStatus = { state: "idle" };
let running: Promise<UpdateStatus> | null = null;
let lastAttempt = 0;
let timer: NodeJS.Timeout | null = null;

export function updateStatus(): UpdateStatus {
  return status;
}

function linuxPackage(): "deb" | "rpm" | null {
  try {
    const type = readFileSync(path.join(process.resourcesPath, "package-type"), "utf8").trim();
    return type === "deb" || type === "rpm" ? type : null;
  } catch {
    return null;
  }
}

function downloadUrl(): string {
  const cpu = CPU[process.arch];
  if (!cpu) return DOWNLOAD_PAGE;
  if (process.platform === "darwin") {
    return latestFileUrl("desktop", `metis-suite-${cpu}-apple-darwin.dmg`);
  }
  if (process.platform === "win32") {
    return latestFileUrl("desktop", `metis-suite-${cpu}-pc-windows-msvc.exe`);
  }
  const ext = process.platform === "linux" ? linuxPackage() : null;
  return ext
    ? latestFileUrl("desktop", `metis-suite-${cpu}-unknown-linux-gnu.${ext}`)
    : DOWNLOAD_PAGE;
}

export function downloadUpdate(): void {
  const url = downloadUrl();
  log("update download opened", { url });
  void shell.openExternal(url);
}

export function checkForUpdates(): Promise<UpdateStatus> {
  running ??= (async () => {
    lastAttempt = Date.now();
    status = { state: "checking" };
    try {
      const latest = await fetchLatestVersion("desktop", (url, init) => net.fetch(url, init));
      const current = app.getVersion();
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
    return status;
  })().finally(() => {
    running = null;
  });
  return running;
}

export function markAnnounced(result: UpdateStatus): void {
  if (result.state !== "available") return;
  if (readSettings().announcedVersion === result.version) return;
  writeSettings({ announcedVersion: result.version });
}

function announce(result: UpdateStatus, openAbout: () => void): void {
  if (result.state !== "available") return;
  if (readSettings().announcedVersion === result.version) return;
  markAnnounced(result);
  log("update announced", { version: result.version });
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: `Metis Suite ${result.version} is available`,
    body: "Open Settings to download it.",
  });
  notification.on("click", openAbout);
  notification.show();
}

async function automaticCheck(openAbout: () => void): Promise<void> {
  if (!readSettings().checkForUpdates) return;
  announce(await checkForUpdates(), openAbout);
}

export function scheduleUpdateChecks(enabled: boolean, openAbout: () => void): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (!enabled) return;
  void automaticCheck(openAbout);
  timer = setInterval(() => {
    if (Date.now() - lastAttempt >= UPDATE_CHECK_INTERVAL_MS) void automaticCheck(openAbout);
  }, TICK_MS);
}
