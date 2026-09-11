import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

const kbGzipped = (paths: string[]) =>
  paths.reduce((sum, p) => sum + gzipSync(readFileSync(p)).length, 0) / 1024;

test.describe("performance budget", () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "measured once, on desktop Chromium",
  );

  test("critical JavaScript (before any island hydrates) is under 70 KB gzipped", async ({
    page,
  }) => {
    // Stall client:idle and never scroll, so only the eagerly loaded scripts are requested.
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0;
    });
    const scripts = new Set<string>();
    page.on("request", (r) => {
      if (r.resourceType() === "script") scripts.add(new URL(r.url()).pathname);
    });
    await page.goto("/", { waitUntil: "networkidle" });

    expect(scripts.size).toBeGreaterThan(0);
    expect(kbGzipped([...scripts].map((p) => join("dist", p)))).toBeLessThan(
      70,
    );
  });

  test("all shipped JavaScript is under 200 KB gzipped", () => {
    const dir = join("dist", "_astro");
    const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
    expect(kbGzipped(files.map((f) => join(dir, f)))).toBeLessThan(200);
  });

  test("cumulative layout shift while the page settles is under 0.05", async ({
    page,
  }) => {
    await page.goto("/");
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 2000);
        }),
    );
    expect(cls).toBeLessThan(0.05);
  });
});
