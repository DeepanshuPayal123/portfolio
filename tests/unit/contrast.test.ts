import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// WCAG 2.x contrast for the colour tokens in global.css, so a palette tweak can't quietly break AA.
const css = readFileSync("src/styles/global.css", "utf8");

function tokens(block: RegExp): Record<string, string> {
  const body = css.match(block)?.[1] ?? "";
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
      m[1]!,
      m[2]!,
    ]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const modes = {
  night: tokens(/:root\s*\{([^}]*)\}/),
  dawn: tokens(/:root\[data-theme=['"]light['"]\]\s*\{([^}]*)\}/),
};

describe.each(Object.entries(modes))("%s palette", (_mode, t) => {
  test.each([
    ["ink", "paper"],
    ["ink-dim", "paper"],
    ["ink", "panel"],
    ["ink-dim", "panel"],
    ["accent", "paper"],
    ["accent", "panel"],
    ["on-accent", "accent-strong"],
  ])("%s on %s is at least 4.5:1", (fg, bg) => {
    expect(t[fg], `--${fg}`).toBeDefined();
    expect(t[bg], `--${bg}`).toBeDefined();
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});
