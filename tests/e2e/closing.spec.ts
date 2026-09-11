import { expect, test } from "@playwright/test";

test("the page closes by thanking the visitor, signed by hand", async ({
  page,
}) => {
  await page.goto("/");
  const closing = page.locator("#closing");
  await closing.scrollIntoViewIfNeeded();
  await expect(
    closing.getByRole("heading", { name: /thanks for visiting/i }),
  ).toBeVisible();

  const signature = closing.locator("[data-signature]");
  await expect(signature).toHaveAttribute("aria-hidden", "true");
  await expect(signature).toHaveAttribute("data-drawn", "true");
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the signature is already written, with no drawing animation", async ({
    page,
  }) => {
    await page.goto("/");
    const signature = page.locator("#closing [data-signature]");
    await expect(signature).toHaveAttribute("data-drawn", "true");
    expect(
      await signature
        .locator("text")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });
});
