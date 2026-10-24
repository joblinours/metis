import { z } from "zod";

import type { Settings } from "./settings-types";
import { readStoredSettings, writeStoredSettings } from "./store";

export const DEFAULT_SETTINGS: Settings = {
  restoreLastPage: true,
  textZoom: 100,
};

export const MIN_TEXT_ZOOM = 50;
export const MAX_TEXT_ZOOM = 300;
export const TEXT_ZOOM_STEP = 10;

function settingsFrom(input: unknown, base: Settings): Settings {
  const fields = z.record(z.string(), z.unknown()).catch({}).parse(input);
  return z
    .object({
      restoreLastPage: z.boolean().catch(base.restoreLastPage),
      textZoom: z.number().int().min(MIN_TEXT_ZOOM).max(MAX_TEXT_ZOOM).catch(base.textZoom),
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

export function clampTextZoom(value: number): number {
  const stepped = Math.round(value / TEXT_ZOOM_STEP) * TEXT_ZOOM_STEP;
  return Math.min(MAX_TEXT_ZOOM, Math.max(MIN_TEXT_ZOOM, stepped));
}
