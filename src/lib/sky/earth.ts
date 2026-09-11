import dayHigh from "@/assets/earth-day-high.avif?url";
import dayLow from "@/assets/earth-day-low.avif?url";
import nightHigh from "@/assets/earth-night-high.avif?url";
import nightLow from "@/assets/earth-night-low.avif?url";
import type { SkyMode } from "@/lib/sky/params";

// Which Earth texture a visitor should download, if any. Built from NASA imagery by
// scripts/make-earth.mjs; only one file is ever fetched per visit.

export type EarthQuality = "high" | "low" | "none";

export interface DeviceHints {
  saveData?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  viewportWidth: number;
}

export function earthQuality(hints: DeviceHints): EarthQuality {
  if (hints.saveData) return "none";
  const { deviceMemory, hardwareConcurrency, viewportWidth } = hints;
  // Safari reports neither hint; assume the smaller texture rather than guessing high.
  if (deviceMemory === undefined || hardwareConcurrency === undefined)
    return "low";
  if (viewportWidth < 640 || deviceMemory <= 2 || hardwareConcurrency <= 2)
    return "low";
  return "high";
}

const TEXTURES: Record<SkyMode, Record<"high" | "low", string>> = {
  night: { high: nightHigh, low: nightLow },
  dawn: { high: dayHigh, low: dayLow },
};

export function earthTexture(
  mode: SkyMode,
  quality: EarthQuality,
): string | null {
  return quality === "none" ? null : TEXTURES[mode][quality];
}
