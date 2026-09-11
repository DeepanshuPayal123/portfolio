import { expect, test } from "@playwright/test";

const NODES: Record<string, string> = {
  "IIT Jodhpur": "#education",
  PRQLite: "#prqlite",
  LOCKSTEP: "#lockstep",
  "InduBindu ERP": "#erp",
  Decklar: "#job-decklar",
  "123OfAI": "#job-123ofai",
  "Your team": "#contact",
};

test.describe("blueprint diagram", () => {
  test("every node links to its section", async ({ page }) => {
    await page.goto("/");
    const diagram = page.locator("#system [data-diagram]:visible");
    await expect(diagram.locator("[data-node]")).toHaveCount(
      Object.keys(NODES).length,
    );
    for (const [name, href] of Object.entries(NODES)) {
      await expect(diagram.getByRole("link", { name })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  test("clicking a node scrolls to that section", async ({ page }) => {
    await page.goto("/");
    await page
      .locator("#system [data-diagram]:visible")
      .getByRole("link", { name: "PRQLite" })
      .click();
    await expect(page.locator("#prqlite")).toBeInViewport();
  });

  test("packets travel along the edges", async ({ page }) => {
    await page.goto("/");
    const packet = page
      .locator("#system [data-diagram]:visible [data-packet]")
      .first();
    await expect(packet).toBeVisible();
    const before = await packet.boundingBox();
    await page.waitForTimeout(400);
    const after = await packet.boundingBox();
    expect(after).not.toEqual(before);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the diagram is static: edges fully drawn, no packets", async ({
    page,
  }) => {
    await page.goto("/");
    const diagram = page.locator("#system [data-diagram]:visible");
    await expect(diagram).toHaveAttribute("data-motion", "static");
    await expect(diagram.locator("[data-packet]").first()).toBeHidden();
    const offsets = await diagram
      .locator("[data-edge]")
      .evaluateAll((edges) =>
        edges.map((e) => getComputedStyle(e).strokeDashoffset),
      );
    expect(offsets.every((o) => o === "0" || o === "0px")).toBe(true);
  });
});
