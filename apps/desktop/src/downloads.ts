import { existsSync } from "node:fs";
import path from "node:path";

import {
  app,
  type BrowserWindow,
  type DownloadItem,
  Notification,
  type Session,
  shell,
} from "electron";

import { readSettings, writeSettings } from "./settings";

const active = new Set<DownloadItem>();

function uniquePath(folder: string, filename: string): string {
  const parsed = path.parse(path.basename(filename));
  let candidate = path.join(folder, parsed.base);
  for (let n = 1; existsSync(candidate); n++) {
    candidate = path.join(folder, `${parsed.name} (${n})${parsed.ext}`);
  }
  return candidate;
}

function updateProgress(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;
  if (active.size === 0) {
    window.setProgressBar(-1);
    return;
  }
  let received = 0;
  let total = 0;
  for (const item of active) {
    received += item.getReceivedBytes();
    total += item.getTotalBytes();
  }
  window.setProgressBar(total > 0 ? received / total : 2, {
    mode: total > 0 ? "normal" : "indeterminate",
  });
}

function notifyDone(item: DownloadItem): void {
  if (!readSettings().downloadNotify || !Notification.isSupported()) return;
  const savePath = item.getSavePath();
  const notification = new Notification({
    title: "Download complete",
    body: path.basename(savePath),
  });
  notification.on("click", () => shell.showItemInFolder(savePath));
  notification.show();
}

export function handleDownloads(session: Session, window: () => BrowserWindow | null): void {
  session.on("will-download", (_event, item) => {
    const settings = readSettings();
    const filename = item.getFilename();
    if (settings.downloadMode === "folder" && settings.downloadFolder) {
      item.setSavePath(uniquePath(settings.downloadFolder, filename));
    } else {
      const folder = settings.lastDownloadFolder ?? app.getPath("downloads");
      item.setSaveDialogOptions({ defaultPath: path.join(folder, filename) });
    }

    active.add(item);
    updateProgress(window());
    item.on("updated", () => updateProgress(window()));
    item.once("done", (_doneEvent, state) => {
      active.delete(item);
      updateProgress(window());
      if (state !== "completed") return;
      if (readSettings().downloadMode === "ask") {
        writeSettings({ lastDownloadFolder: path.dirname(item.getSavePath()) });
      }
      notifyDone(item);
    });
  });
}
