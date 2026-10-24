import { z } from "zod";

import type { Settings } from "./settings-types";
import { readStoredSettings, writeStoredSettings } from "./store";

export const DEFAULT_SETTINGS: Settings = {
  openAtLogin: false,
  startMinimized: false,
  closeToTray: false,
  restoreLastPage: true,
  downloadMode: "ask",
  downloadFolder: null,
  downloadNotify: true,
  lastDownloadFolder: null,
  spellcheck: true,
  spellcheckLanguages: [],
  hardwareAcceleration: true,
  zoomFactor: 1,
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;

function settingsFrom(input: unknown, base: Settings): Settings {
  const fields = z.record(z.string(), z.unknown()).catch({}).parse(input);
  const folder = z.string().min(1).nullable();
  return z
    .object({
      openAtLogin: z.boolean().catch(base.openAtLogin),
      startMinimized: z.boolean().catch(base.startMinimized),
      closeToTray: z.boolean().catch(base.closeToTray),
      restoreLastPage: z.boolean().catch(base.restoreLastPage),
      downloadMode: z.enum(["ask", "folder"]).catch(base.downloadMode),
      downloadFolder: folder.catch(base.downloadFolder),
      downloadNotify: z.boolean().catch(base.downloadNotify),
      lastDownloadFolder: folder.catch(base.lastDownloadFolder),
      spellcheck: z.boolean().catch(base.spellcheck),
      spellcheckLanguages: z.array(z.string().max(20)).max(10).catch(base.spellcheckLanguages),
      hardwareAcceleration: z.boolean().catch(base.hardwareAcceleration),
      zoomFactor: z.number().min(MIN_ZOOM).max(MAX_ZOOM).catch(base.zoomFactor),
    })
    .parse({ ...base, ...fields });
}

export function readSettings(): Settings {
  return settingsFrom(readStoredSettings(), DEFAULT_SETTINGS);
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = settingsFrom(patch, readSettings());
  writeStoredSettings(next);
  return next;
}
