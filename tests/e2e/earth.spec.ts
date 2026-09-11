import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const sky = (page: Page) => page.locator("canvas[data-sky]");

function earthRequests(page: Page) {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (/earth-(night|day)-(high|low)[.\w-]*\.avif/.test(r.url()))
      urls.push(r.url());
  });
  return urls;
}

test("night loads the city-lights map, and only one texture", async ({
  page,
}) => {
  const urls = earthRequests(page);
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-earth", "loaded");
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(/earth-night-(high|low)[.\w-]*\.avif/);
});

test("dawn loads the daylight map", async ({ page }) => {
  const urls = earthRequests(page);
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-earth", "loaded");
  expect(urls[0]).toMatch(/earth-day-(high|low)[.\w-]*\.avif/);
});

test("the texture waits until the page has loaded", async ({ page }) => {
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-earth", "loaded");
  const startedAfterLoad = await page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const earth = performance
      .getEntriesByType("resource")
      .find((entry) =>
        /earth-(night|day)-(high|low)[.\w-]*\.avif/.test(entry.name),
      );
    return earth ? earth.startTime >= nav.domContentLoadedEventEnd : null;
  });
  expect(startedAfterLoad).toBe(true);
});

test("Save-Data skips the texture completely", async ({ page }) => {
  const urls = earthRequests(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      get: () => ({ saveData: true }),
    });
  });
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-earth", "skipped");
  await page.waitForTimeout(500);
  expect(urls).toEqual([]);
});

test("the shipped textures stay small", () => {
  const dir = join("dist", "_astro");
  const textures = readdirSync(dir).filter((f) => /^earth-.*\.avif$/.test(f));
  expect(textures).toHaveLength(4);
  for (const file of textures) {
    const kb = readFileSync(join(dir, file)).length / 1024;
    expect(kb, file).toBeLessThan(140);
  }
});
