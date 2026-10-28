import path from "node:path";

import { app, Menu, nativeImage, Tray } from "electron";

export interface TrayActions {
  show: () => void;
  settings: () => void;
  checkForUpdates: () => void;
  quit: () => void;
}

let tray: Tray | null = null;

function trayIcon() {
  const folder = path.join(app.getAppPath(), "static");
  if (process.platform === "darwin") {
    const image = nativeImage.createFromPath(path.join(folder, "trayTemplate.png"));
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage
    .createFromPath(path.join(folder, "icon.png"))
    .resize({ width: 22, height: 22 });
}

export function hasTray(): boolean {
  return tray !== null;
}

export function setTray(enabled: boolean, actions: TrayActions): void {
  if (!enabled) {
    tray?.destroy();
    tray = null;
    return;
  }
  if (tray) return;
  tray = new Tray(trayIcon());
  tray.setToolTip("Metis Suite");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Metis Suite", click: () => actions.show() },
      { label: "Settings…", click: () => actions.settings() },
      { label: "Check for updates…", click: () => actions.checkForUpdates() },
      { type: "separator" },
      { label: "Quit", click: () => actions.quit() },
    ]),
  );
  tray.on("click", () => actions.show());
}
