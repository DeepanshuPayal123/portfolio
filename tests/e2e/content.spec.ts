import { expect, test } from "@playwright/test";

test.describe("recruiter first screen", () => {
  test("name, role and every contact route are visible without scrolling", async ({
    page,
  }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("heading", { level: 1 })).toContainText(
      "Deepanshu",
    );
    await expect(hero.getByText("Software Engineer").first()).toBeInViewport();
    for (const name of ["Resume", "GitHub", "LinkedIn", "Email"]) {
      await expect(hero.getByRole("link", { name }).first()).toBeInViewport();
    }
  });

  test("contact links point to the right places", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator("#top");
    await expect(hero.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "href",
      "/resume.pdf",
    );
    await expect(hero.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/DeepanshuPayal123",
    );
    await expect(hero.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:deepanshu280607@gmail.com",
    );
    await expect(hero.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      /linkedin\.com/,
    );
  });
});

test.describe("resume content", () => {
  test("every section is on the page", async ({ page }) => {
    await page.goto("/");
    for (const id of [
      "experience",
      "projects",
      "skills",
      "education",
      "contact",
    ]) {
      await expect(page.locator(`section#${id}`)).toBeAttached();
    }
  });

  test("experience leads with measurable outcomes", async ({ page }) => {
    await page.goto("/");
    const experience = page.locator("#experience");
    for (const text of ["123OfAI", "Decklar", "O(log N)", "96 KB", "95%"]) {
      await expect(experience).toContainText(text);
    }
  });

  test("projects link to source, and the LOCKSTEP card has no credit line", async ({
    page,
  }) => {
    await page.goto("/");
    const card = (name: string) =>
      page.locator("#projects article").filter({ hasText: name });

    await expect(
      card("PRQLite").getByRole("link", { name: /source/i }),
    ).toHaveAttribute("href", "https://github.com/DeepanshuPayal123/PRQLite");

    const lockstep = card("LOCKSTEP");
    await expect(lockstep).toContainText("used to study consensus hands-on");
    await expect(lockstep).not.toContainText("Study implementation built on");

    await expect(card("Order Management")).toContainText("1000+");
  });
});

test.describe("honesty and privacy", () => {
  test("no phone number, and no claims about unimplemented PRQLite features", async ({
    page,
  }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toContain("9649939033");
    expect(html).not.toContain("+91");
    expect(html).not.toMatch(/B\+ ?tree/i);
    expect(html).not.toMatch(/crash[- ]recovery/i);
  });
});

test.describe("routes and metadata", () => {
  test("/resume forwards to the PDF", async ({ page }) => {
    const res = await page.request.get("/resume");
    expect(await res.text()).toMatch(
      /http-equiv="refresh"[^>]*url=\/resume\.pdf/,
    );
  });

  test("unknown paths get the 404 page", async ({ page }) => {
    const res = await page.goto("/definitely-not-here");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: /home/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  test("title and description are set for search and link previews", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Deepanshu/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /.{60,}/,
    );
  });
});
