import { describe, expect, test } from "vitest";
import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  nextTheme,
  resolveInitialTheme,
} from "@/lib/theme";

describe("theme", () => {
  test("defaults to the dark blueprint", () => {
    expect(resolveInitialTheme(null)).toBe("dark");
  });

  test("a stored choice wins", () => {
    expect(resolveInitialTheme("light")).toBe("light");
    expect(resolveInitialTheme("dark")).toBe("dark");
  });

  test("ignores anything unexpected in storage", () => {
    expect(resolveInitialTheme("purple")).toBe("dark");
    expect(resolveInitialTheme("")).toBe("dark");
  });

  test("toggles between the two", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });

  test("browser chrome colors match the page grounds", () => {
    expect(THEME_COLORS).toEqual({ dark: "#071426", light: "#f4f1e8" });
    expect(THEME_STORAGE_KEY).toBe("theme");
  });
});
