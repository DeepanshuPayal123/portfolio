// Pure inputs for the sky shader: how high the planet stands, pointer parallax, and colours.

export type SkyMode = "night" | "dawn";
export type RGB = readonly [number, number, number];

export interface SkyPalette {
  skyTop: RGB;
  skyHorizon: RGB;
  /** Atmosphere rim colour. */
  glow: RGB;
  /** Sun flare on the horizon. */
  flare: RGB;
  planet: RGB;
  /** Star brightness, 0–1. */
  stars: number;
  /** Nebula strength, 0–1. */
  nebula: number;
}

const rgb = (hex: string): RGB => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];

const PALETTES: Record<SkyMode, SkyPalette> = {
  night: {
    skyTop: rgb("#02040c"),
    skyHorizon: rgb("#0a1a3f"),
    glow: rgb("#3d7bff"),
    flare: rgb("#d6e9ff"),
    planet: rgb("#01030a"),
    stars: 1,
    nebula: 0.6,
  },
  dawn: {
    skyTop: rgb("#dfe8f8"),
    skyHorizon: rgb("#f6dcc8"),
    glow: rgb("#ffa866"),
    flare: rgb("#fff4e2"),
    planet: rgb("#34405e"),
    stars: 0.12,
    nebula: 0.25,
  },
};

export function palette(mode: SkyMode): SkyPalette {
  return PALETTES[mode];
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));
const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * 1 when the planet stands fully risen, 0 when it has set. It frames the first and the last
 * viewport of the page and sinks while the visitor is in between.
 */
export function planetRise(
  scrollY: number,
  viewportH: number,
  docH: number,
): number {
  if (docH <= viewportH) return 1;
  const hero = 1 - clamp(scrollY / viewportH, 0, 1);
  const remaining = docH - viewportH - scrollY;
  const end = 1 - clamp(remaining / viewportH, 0, 1);
  return smoothstep(Math.max(hero, end));
}

/** Pointer position as [-1, 1] on both axes, y pointing up (GL convention), clamped. */
export function pointerParallax(
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] {
  const nx = clamp((x - width / 2) / (width / 2), -1, 1);
  const ny = clamp((height / 2 - y) / (height / 2), -1, 1);
  return [nx + 0, ny + 0];
}
