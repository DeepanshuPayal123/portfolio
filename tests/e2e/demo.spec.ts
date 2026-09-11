import { expect, test, type Page } from "@playwright/test";

// The demo is a client:visible island inside the PRQLite card.
async function openDemo(page: Page) {
  await page.goto("/");
  const demo = page.locator("#prqlite-demo");
  await demo.scrollIntoViewIfNeeded();
  await expect(
    page.locator('astro-island[component-url*="PrqliteDemo"]'),
  ).not.toHaveAttribute("ssr", /.*/);
  return demo;
}

const STAGES = ["Tokens", "AST", "Analyzer", "Plan", "Execution", "Result"];

test("it is labelled honestly as a browser port of the C++ engine", async ({
  page,
}) => {
  const demo = await openDemo(page);
  await expect(demo).toContainText(/browser port/i);
});

test("a preset query runs through every stage and returns the right rows", async ({
  page,
}) => {
  const demo = await openDemo(page);
  await demo.getByRole("button", { name: /filter \+ project/i }).click();
  await demo.getByRole("button", { name: /^run/i }).click();

  for (const stage of STAGES) {
    await expect(
      demo.getByRole("tab", { name: new RegExp(stage) }),
    ).toHaveAttribute("data-status", "ok");
  }
  await expect(demo.getByTestId("repl-output")).toContainText("(2 rows)");
  await expect(demo.getByRole("tab", { name: /Result/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("an error stops at the stage that raised it", async ({ page }) => {
  const demo = await openDemo(page);
  await demo.getByRole("textbox", { name: /sql/i }).fill("SELECT * users;");
  await demo.getByRole("button", { name: /^run/i }).click();

  await expect(demo.getByRole("tab", { name: /Tokens/ })).toHaveAttribute(
    "data-status",
    "ok",
  );
  await expect(demo.getByRole("tab", { name: /AST/ })).toHaveAttribute(
    "data-status",
    "error",
  );
  await expect(demo.getByRole("tab", { name: /Analyzer/ })).toHaveAttribute(
    "data-status",
    "skipped",
  );
  await expect(demo.getByTestId("repl-output")).toContainText(
    "Error: SYNTAX ERROR: expected FROM",
  );
});

test("the database keeps its state between queries, and Reset restores the seed", async ({
  page,
}) => {
  const demo = await openDemo(page);
  const sql = demo.getByRole("textbox", { name: /sql/i });
  const run = demo.getByRole("button", { name: /^run/i });
  const console = demo.getByTestId("repl-output");

  await sql.fill("DELETE FROM users WHERE active = false;");
  await run.click();
  await expect(console).toContainText("(2 rows) Affected");

  await sql.fill("SELECT * FROM users;");
  await run.click();
  await expect(console).toContainText("(3 rows)");

  await demo.getByRole("button", { name: /reset/i }).click();
  await expect(console).not.toContainText("(3 rows)");
  await sql.fill("SELECT * FROM users;");
  await run.click();
  await expect(console).toContainText("(5 rows)");
});

test("⌘/Ctrl+Enter runs the editor", async ({ page }) => {
  const demo = await openDemo(page);
  const sql = demo.getByRole("textbox", { name: /sql/i });
  await sql.fill("SELECT name FROM users WHERE name = 'bob';");
  await sql.press("ControlOrMeta+Enter");
  await expect(demo.getByTestId("repl-output")).toContainText("(1 rows)");
});

test("the storage view follows deletes: the slot is zeroed, not reclaimed", async ({
  page,
}) => {
  const demo = await openDemo(page);
  const storage = demo.getByTestId("storage");
  await expect(storage.locator('[data-slot="live"]')).toHaveCount(5);

  await demo
    .getByRole("textbox", { name: /sql/i })
    .fill("DELETE FROM users WHERE id = 2;");
  await demo.getByRole("button", { name: /^run/i }).click();
  await expect(storage.locator('[data-slot="live"]')).toHaveCount(4);
  await expect(storage.locator('[data-slot="deleted"]')).toHaveCount(1);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the result is shown at once, without stepping through stages", async ({
    page,
  }) => {
    const demo = await openDemo(page);
    await demo.getByRole("button", { name: /filter \+ project/i }).click();
    await demo.getByRole("button", { name: /^run/i }).click();
    await expect(demo.getByRole("tab", { name: /Result/ })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 300 },
    );
  });
});
