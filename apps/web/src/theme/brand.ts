import { isOneOf } from "@/lib/guards";

export const THEME_BRAND_IDS = ["amber", "blue", "violet", "emerald", "rose", "slate"] as const;

export type ThemeBrandId = (typeof THEME_BRAND_IDS)[number];

export const DEFAULT_THEME_BRAND: ThemeBrandId = "amber";

export const BRAND_OPTIONS: { id: ThemeBrandId; label: string }[] = [
  { id: "amber", label: "Amber" },
  { id: "blue", label: "Blue" },
  { id: "violet", label: "Violet" },
  { id: "emerald", label: "Emerald" },
  { id: "rose", label: "Rose" },
  { id: "slate", label: "Slate" },
];

export function isThemeBrand(value: unknown): value is ThemeBrandId {
  return isOneOf(THEME_BRAND_IDS, value);
}
