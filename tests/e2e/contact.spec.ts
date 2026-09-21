import { expect, test, type Page } from "@playwright/test";

const form = (page: Page) => page.locator("#contact form");

/** The preview server serves static files only, so the endpoint is stubbed here. */
async function stubEndpoint(page: Page, status: number, body: unknown) {
  await page.route("**/api/contact", async (route) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/** The form only works once React has attached; filling before that loses the input. */
async function openForm(page: Page) {
  await page.goto("/#contact");
  await expect(form(page).getByRole("button", { name: /send/i })).toBeEnabled();
}

test("the contact section keeps the email link and adds a form", async ({
  page,
}) => {
  await page.goto("/#contact");
  await expect(
    page
      .locator("#contact")
      .getByRole("link", { name: /deepanshu280607@gmail\.com/ }),
  ).toBeVisible();
  await expect(form(page).getByLabel("Name")).toBeVisible();
  await expect(form(page).getByLabel(/email or phone/i)).toBeVisible();
  await expect(form(page).getByLabel("Message")).toBeVisible();
});

test("empty fields are caught before anything is sent", async ({ page }) => {
  let called = false;
  await page.route("**/api/contact", async (route) => {
    called = true;
    await route.fulfill({ status: 200, body: "{}" });
  });

  await openForm(page);
  await form(page).getByRole("button", { name: /send/i }).click();
  await expect(form(page).getByText(/tell me your name/i)).toBeVisible();
  expect(called).toBe(false);
});

test("a complete message reports that it was sent", async ({ page }) => {
  await stubEndpoint(page, 200, { ok: true });
  await openForm(page);

  await form(page).getByLabel("Name").fill("Rahul Verma");
  await form(page)
    .getByLabel(/email or phone/i)
    .fill("rahul@corp.com");
  await form(page)
    .getByLabel("Message")
    .fill("We are hiring backend engineers — are you free to chat?");
  await form(page).getByRole("button", { name: /send/i }).click();

  await expect(
    page.locator("#contact").getByText(/thanks|sent/i),
  ).toBeVisible();
});

test("a failure tells the visitor to email instead", async ({ page }) => {
  await stubEndpoint(page, 502, { ok: false });
  await openForm(page);

  await form(page).getByLabel("Name").fill("Rahul Verma");
  await form(page)
    .getByLabel(/email or phone/i)
    .fill("rahul@corp.com");
  await form(page)
    .getByLabel("Message")
    .fill("We are hiring backend engineers — are you free to chat?");
  await form(page).getByRole("button", { name: /send/i }).click();

  await expect(
    page.locator("#contact").getByText(/could not send|email me/i),
  ).toBeVisible();
});

test("the honeypot is hidden from people and from screen readers", async ({
  page,
}) => {
  await page.goto("/#contact");
  const honeypot = form(page).locator('input[name="company"]');
  await expect(honeypot).toBeHidden();
  await expect(honeypot).toHaveAttribute("tabindex", "-1");
});
