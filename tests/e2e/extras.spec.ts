import { expect, test, type Page } from "@playwright/test";

// The palette and terminal are client:idle islands; wait until both have hydrated.
async function ready(page: Page) {
  await page.goto("/");
  for (const name of ["CommandPalette", "Terminal"]) {
    await expect(
      page.locator(`astro-island[component-url*="${name}"]`),
    ).not.toHaveAttribute("ssr", /.*/);
  }
}

const palette = (page: Page) =>
  page.getByRole("dialog", { name: /command palette/i });
const terminal = (page: Page) =>
  page.getByRole("dialog", { name: /terminal/i });

test.describe("command palette", () => {
  test("⌘K / Ctrl+K opens it, and Enter runs the top result", async ({
    page,
  }) => {
    await ready(page);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    const input = palette(page).getByRole("combobox");
    await expect(input).toBeFocused();

    await input.fill("proj");
    await input.press("Enter");
    await expect(palette(page)).toBeHidden();
    await expect(page.locator("#projects")).toBeInViewport();
  });

  test("arrow keys move the selection; Esc closes and returns focus", async ({
    page,
  }) => {
    await ready(page);
    const trigger = page.getByRole("button", { name: /command palette/i });
    await trigger.click();
    const options = palette(page).getByRole("option");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.first()).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("Escape");
    await expect(palette(page)).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe("terminal", () => {
  test("~ opens it, commands print output, exit closes it", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "phones have no hardware ~ key; the palette route is tested below",
    );
    await ready(page);
    await page.keyboard.press("~");
    await expect(terminal(page)).toBeVisible();

    const input = terminal(page).getByRole("textbox", {
      name: /terminal command/i,
    });
    await expect(input).toBeFocused();
    await input.fill("whoami");
    await input.press("Enter");
    await expect(terminal(page).getByRole("log")).toContainText("Deepanshu");

    await input.fill("exit");
    await input.press("Enter");
    await expect(terminal(page)).toBeHidden();
  });

  test("~ typed into a text field stays in the field", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "phones have no hardware ~ key");
    await ready(page);
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page).getByRole("combobox");
    await input.press("~");
    await expect(input).toHaveValue("~");
    await expect(terminal(page)).toBeHidden();
  });

  test("reachable from the palette on any device, and Esc closes it", async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole("button", { name: /command palette/i }).click();
    await palette(page).getByRole("combobox").fill("terminal");
    await page.keyboard.press("Enter");
    await expect(terminal(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(terminal(page)).toBeHidden();
  });
});
