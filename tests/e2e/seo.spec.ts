import { expect, test } from "@playwright/test";

test("link previews: Open Graph and Twitter point at a 1200×630 PNG", async ({
  page,
}) => {
  await page.goto("/");
  const image = await page
    .locator('meta[property="og:image"]')
    .getAttribute("content");
  expect(image).toMatch(/^https?:\/\/[^/]+\/og\.png$/);
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    image!,
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute(
    "content",
    "1200",
  );
  await expect(
    page.locator('meta[property="og:image:height"]'),
  ).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    /.{20,}/,
  );

  const res = await page.request.get("/og.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const png = await res.body();
  // IHDR chunk: width at byte 16, height at byte 20.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test("structured data describes a Person, without the phone number", async ({
  page,
}) => {
  await page.goto("/");
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const person = JSON.parse(raw ?? "{}");
  expect(person["@context"]).toBe("https://schema.org");
  expect(person["@type"]).toBe("Person");
  expect(person.name).toBe("Deepanshu");
  expect(person.jobTitle).toBe("Software Engineer");
  expect(person.alumniOf?.name).toBe("Indian Institute of Technology, Jodhpur");
  expect(person.sameAs).toContain("https://github.com/DeepanshuPayal123");
  expect(raw).not.toContain("9649939033");
});

test("robots.txt points crawlers at the sitemap", async ({ page }) => {
  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toMatch(/^User-agent: \*$/m);
  expect(robots).toMatch(/^Sitemap: https?:\/\/[^/]+\/sitemap-index\.xml$/m);
  expect((await page.request.get("/sitemap-index.xml")).status()).toBe(200);
});
