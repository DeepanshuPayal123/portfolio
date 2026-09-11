import { describe, expect, test } from "vitest";
import { earthQuality, earthTexture } from "@/lib/sky/earth";

// Which Earth texture (if any) a visitor should download.
describe("earth texture policy", () => {
  const desktop = {
    saveData: false,
    deviceMemory: 8,
    hardwareConcurrency: 8,
    viewportWidth: 1440,
  };

  test("nothing is downloaded when the visitor asked to save data", () => {
    expect(earthQuality({ ...desktop, saveData: true })).toBe("none");
  });

  test("phones and weak devices get the small texture", () => {
    expect(earthQuality({ ...desktop, viewportWidth: 390 })).toBe("low");
    expect(earthQuality({ ...desktop, deviceMemory: 2 })).toBe("low");
    expect(earthQuality({ ...desktop, hardwareConcurrency: 2 })).toBe("low");
  });

  test("a normal desktop gets the full texture", () => {
    expect(earthQuality(desktop)).toBe("high");
  });

  test("when the browser reports no hints, stay conservative", () => {
    expect(earthQuality({ viewportWidth: 1440 })).toBe("low");
  });

  test("night samples the city lights, dawn the daylight map", () => {
    expect(earthTexture("night", "high")).toMatch(/night/);
    expect(earthTexture("dawn", "high")).toMatch(/day/);
  });

  test('each quality has its own file, and "none" has none', () => {
    expect(earthTexture("night", "low")).not.toBe(
      earthTexture("night", "high"),
    );
    expect(earthTexture("night", "none")).toBeNull();
    expect(earthTexture("dawn", "none")).toBeNull();
  });
});
