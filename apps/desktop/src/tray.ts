import path from "node:path";

import { Menu, nativeImage, Tray } from "electron";

export interface TrayActions {
  show: () => void;
  settings: () => void;
  quit: () => void;
}

let tray: Tray | null = null;

function trayIcon() {
  const size = process.platform === "darwin" ? 18 : 22;
  return nativeImage
    .createFromPath(path.join(__dirname, "..", "static", "icon.png"))
    .resize({ width: size, height: size });
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
      { label: "Show Metis Suite", click: actions.show },
      { label: "Settings…", click: actions.settings },
      { type: "separator" },
      { label: "Quit", click: actions.quit },
    ]),
  );
  tray.on("click", actions.show);
}
