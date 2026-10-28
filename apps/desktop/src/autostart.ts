import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { app } from "electron";

export const HIDDEN_ARG = "--hidden";

function autostartFile(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, "autostart", "metis-suite-desktop.desktop");
}

function execArgument(value: string): string {
  if (/^[\w./-]+$/.test(value)) return value;
  return `"${value.replace(/(["`$\\])/g, "\\$1")}"`;
}

function launchCommand(hidden: boolean): string {
  const parts = [process.execPath];
  if (process.defaultApp) parts.push(app.getAppPath());
  if (hidden) parts.push(HIDDEN_ARG);
  return parts.map(execArgument).join(" ");
}

function writeLinuxAutostart(enabled: boolean, hidden: boolean): void {
  const file = autostartFile();
  if (!enabled) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Metis Suite",
      `Exec=${launchCommand(hidden)}`,
      "Icon=metis-suite-desktop",
      "Terminal=false",
      "X-GNOME-Autostart-enabled=true",
      "",
    ].join("\n"),
  );
}

export function applyAutostart(enabled: boolean, hidden: boolean): void {
  if (process.platform === "linux") {
    writeLinuxAutostart(enabled, hidden);
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: hidden ? [HIDDEN_ARG] : [],
  });
}

export function launchedHidden(startMinimized: boolean): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return (
    process.platform === "darwin" && startMinimized && app.getLoginItemSettings().wasOpenedAtLogin
  );
}
