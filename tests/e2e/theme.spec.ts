import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __themeAtDomContentLoaded?: string;
  }
}

test("dark blueprint by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the toggle switches theme and the choice survives a reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /light theme/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#f4f1e8",
  );
  await expect(page.getByRole("button", { name: /dark theme/i })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("a stored theme is applied before the page renders, so there is no flash", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    document.addEventListener("DOMContentLoaded", () => {
      window.__themeAtDomContentLoaded = document.documentElement.dataset.theme;
    });
  });
  await page.goto("/");
  expect(await page.evaluate(() => window.__themeAtDomContentLoaded)).toBe(
    "light",
  );
});
