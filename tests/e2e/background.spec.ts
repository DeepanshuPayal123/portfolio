import { expect, test, type Page } from "@playwright/test";

const sky = (page: Page) => page.locator("canvas[data-sky]");

/** Copies the WebGL canvas into a 2D canvas so its pixels can be read and compared. */
async function snapshot(page: Page) {
  return sky(page).evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! + data[i + 1]! + data[i + 2]! > 30) lit++;
    return { url: copy.toDataURL(), lit };
  });
}

test("the sky canvas sits behind the page and is hidden from assistive tech", async ({
  page,
}) => {
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("aria-hidden", "true");
  expect(await sky(page).evaluate((c) => getComputedStyle(c).position)).toBe(
    "fixed",
  );
  expect(
    await sky(page).evaluate((c) => getComputedStyle(c).pointerEvents),
  ).toBe("none");
});

test("it draws the scene and keeps animating", async ({ page }) => {
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-motion", "live");
  const first = await snapshot(page);
  await page.waitForTimeout(400);
  const second = await snapshot(page);
  expect(first.lit).toBeGreaterThan(0);
  expect(second.url).not.toBe(first.url);
});

test("rendering stops while the tab is hidden", async ({ page }) => {
  await page.goto("/");
  await expect(sky(page)).toHaveAttribute("data-motion", "live");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(sky(page)).toHaveAttribute("data-motion", "paused");
  const first = await snapshot(page);
  await page.waitForTimeout(400);
  expect((await snapshot(page)).url).toBe(first.url);
});

test("without WebGL the page falls back to the CSS horizon", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error — narrowing the overloaded signature isn't worth it in a test stub
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      return type.startsWith("webgl")
        ? null
        : original.call(this, type as "2d", ...(args as []));
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sky", "fallback");
  await expect(sky(page)).toBeHidden();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("one still frame is drawn and nothing moves", async ({ page }) => {
    await page.goto("/");
    await expect(sky(page)).toHaveAttribute("data-motion", "static");
    const first = await snapshot(page);
    await page.waitForTimeout(400);
    const second = await snapshot(page);
    expect(first.lit).toBeGreaterThan(0);
    expect(second.url).toBe(first.url);
  });
});
