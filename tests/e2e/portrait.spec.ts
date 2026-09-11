import { expect, test, type Page } from "@playwright/test";

const hero = (page: Page) => page.locator("#top");
const portrait = (page: Page) =>
  hero(page).getByRole("img", { name: "Portrait of Deepanshu" });

test("the hero shows an optimised portrait that is ready for the first paint", async ({
  page,
}) => {
  await page.goto("/");
  const img = portrait(page);
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute("width", /^\d+$/);
  await expect(img).toHaveAttribute("height", /^\d+$/);
  await expect(img).toHaveAttribute("fetchpriority", "high");
  await expect(img).not.toHaveAttribute("loading", "lazy");
  await expect
    .poll(() =>
      img.evaluate(
        (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(await img.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(
    /\.(avif|webp)(\?|$)/,
  );
});

test("the handwritten annotation is decoration only", async ({ page }) => {
  await page.goto("/");
  const note = hero(page).locator("[data-annotation]");
  await expect(note).toHaveAttribute("aria-hidden", "true");
  await expect(note).toContainText("Build");
  await expect(note).toContainText("Repeat");
});

test("the primary call to action leads to the work", async ({ page }) => {
  await page.goto("/");
  await expect(
    hero(page).getByRole("link", { name: /view my work/i }),
  ).toHaveAttribute("href", "#projects");
});

test("the portrait follows the pointer a little", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones have no hover");
  await page.goto("/");
  const figure = hero(page).locator("[data-portrait]");
  const before = await figure.evaluate((el) => getComputedStyle(el).transform);
  const box = (await figure.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, {
    steps: 8,
  });
  await expect
    .poll(() => figure.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no light sweep and no pointer parallax", async ({ page, isMobile }) => {
    await page.goto("/");
    const sweep = hero(page).locator("[data-sweep]");
    expect(
      await sweep.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    if (isMobile) return;
    const figure = hero(page).locator("[data-portrait]");
    const box = (await figure.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, {
      steps: 8,
    });
    await page.waitForTimeout(300);
    expect(await figure.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
  });
});
