import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { site } from "@/data/site";

// Pre-deploy gate: `npm run deploy` runs it between the build and the upload, so placeholders or a
// build that points at the wrong origin can't be shipped by accident.
describe.runIf(process.env.RELEASE)("release readiness", () => {
  test("LinkedIn points at a real profile", () => {
    expect(site.links.linkedin).toMatch(
      /^https:\/\/(www\.)?linkedin\.com\/in\/[\w-]+\/?$/,
    );
  });

  test("the resume PDF is in public/", () => {
    expect(readFileSync("public/resume.pdf").subarray(0, 4).toString()).toBe(
      "%PDF",
    );
  });

  test("the built page points at the https production origin", () => {
    const html = readFileSync("dist/index.html", "utf8");
    const canonical =
      html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? "";
    expect(canonical).toMatch(/^https:\/\/[^/]+\/$/);
    expect(canonical).not.toContain("localhost");
    expect(html).toContain(`content="${new URL("/og.png", canonical).href}"`);
  });
});
