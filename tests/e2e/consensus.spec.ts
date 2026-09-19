import { expect, test, type Page } from "@playwright/test";

const section = (page: Page) => page.locator("#consensus");
const demo = (page: Page) => page.locator("[data-raft]");
const nodes = (page: Page) => demo(page).locator("[data-node-id]");
const leaderNode = (page: Page) =>
  demo(page).locator('[data-node-id][data-role="leader"]');
const term = async (page: Page) =>
  Number(await demo(page).getAttribute("data-term"));
const committed = async (page: Page) =>
  Number(await demo(page).getAttribute("data-committed"));

async function open(page: Page) {
  await page.goto("/");
  await section(page).scrollIntoViewIfNeeded();
  await expect(demo(page)).toHaveAttribute("data-running", "true", {
    timeout: 10_000,
  });
}

test("the section explains itself and shows five servers", async ({ page }) => {
  await page.goto("/");
  await expect(section(page).getByRole("heading", { level: 2 })).toContainText(
    "Crash the leader",
  );
  await section(page).scrollIntoViewIfNeeded();
  await expect(nodes(page)).toHaveCount(5);
});

test("a leader is elected on its own", async ({ page }) => {
  await open(page);
  await expect(leaderNode(page)).toHaveCount(1, { timeout: 12_000 });
  expect(await term(page)).toBeGreaterThan(0);
});

test("crashing the leader elects a new one in a higher term", async ({
  page,
}) => {
  await open(page);
  await expect(leaderNode(page)).toHaveCount(1, { timeout: 12_000 });
  const oldId = await leaderNode(page).getAttribute("data-node-id");
  const oldTerm = await term(page);

  await section(page).getByRole("button", { name: "Crash leader" }).click();
  await expect(demo(page).locator(`[data-node-id="${oldId}"]`)).toHaveAttribute(
    "data-role",
    "down",
  );
  await expect(leaderNode(page)).toHaveCount(1, { timeout: 15_000 });
  expect(await leaderNode(page).getAttribute("data-node-id")).not.toBe(oldId);
  expect(await term(page)).toBeGreaterThan(oldTerm);
});

test("a write is committed by the cluster", async ({ page }) => {
  await open(page);
  await expect(leaderNode(page)).toHaveCount(1, { timeout: 12_000 });
  const before = await committed(page);

  await section(page).getByRole("button", { name: "Send write" }).click();
  await expect
    .poll(() => committed(page), { timeout: 8_000 })
    .toBeGreaterThan(before);
});

test("clicking a server crashes it, clicking again restarts it", async ({
  page,
}) => {
  await open(page);
  const first = nodes(page).first();
  await first.click();
  await expect(first).toHaveAttribute("data-role", "down");
  await first.click();
  await expect(first).not.toHaveAttribute("data-role", "down");
});

test("every server is a labelled button", async ({ page }) => {
  await open(page);
  for (const id of ["1", "2", "3", "4", "5"]) {
    await expect(
      demo(page).locator(`[data-node-id="${id}"]`),
    ).toHaveAccessibleName(new RegExp(`^S${id},`));
  }
});

test("the simulation pauses when scrolled out of view", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "instant" as ScrollBehavior,
    }),
  );
  await expect(demo(page)).toHaveAttribute("data-running", "false");
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves until the visitor starts it", async ({ page }) => {
    await page.goto("/");
    await section(page).scrollIntoViewIfNeeded();
    const start = section(page).getByRole("button", {
      name: "Start simulation",
    });
    await expect(start).toBeVisible();
    await expect(demo(page)).toHaveAttribute("data-running", "false");
    expect(await term(page)).toBe(0);

    await start.click();
    await expect(demo(page)).toHaveAttribute("data-running", "true");
  });
});
