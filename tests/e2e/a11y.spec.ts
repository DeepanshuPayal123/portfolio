import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Reduced motion keeps scroll reveals from leaving content mid-fade while axe checks contrast.
test.use({ reducedMotion: "reduce" });

async function seriousViolations(page: Page, include?: string) {
  const axe = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (include) axe.include(include);
  const { violations } = await axe.analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

async function hydrated(page: Page, component: string) {
  await expect(
    page.locator(`astro-island[component-url*="${component}"]`),
  ).not.toHaveAttribute("ssr", /.*/);
}

for (const theme of ["dark", "light"] as const) {
  test(`home page: no serious or critical violations (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    await page.goto("/");
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test("404 page: no serious or critical violations", async ({ page }) => {
  await page.goto("/definitely-not-here");
  expect(await seriousViolations(page)).toEqual([]);
});

test("palette and terminal dialogs: no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/");
  await hydrated(page, "CommandPalette");
  await hydrated(page, "Terminal");

  await page.getByRole("button", { name: /command palette/i }).click();
  expect(await seriousViolations(page, '[role="dialog"]')).toEqual([]);

  await page
    .getByRole("dialog", { name: /command palette/i })
    .getByRole("combobox")
    .fill("terminal");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: /terminal/i })).toBeVisible();
  expect(await seriousViolations(page, '[role="dialog"]')).toEqual([]);
});

test("PRQLite demo after a run: no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/");
  const demo = page.locator("#prqlite-demo");
  await demo.scrollIntoViewIfNeeded();
  await hydrated(page, "PrqliteDemo");
  await demo.getByRole("button", { name: /filter \+ project/i }).click();
  await demo.getByRole("button", { name: /^run/i }).click();
  await expect(demo.getByRole("tab", { name: /Result/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await seriousViolations(page, "#prqlite-demo")).toEqual([]);
});
