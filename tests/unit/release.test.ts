import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { site } from "@/data/site";

// Pre-deploy gate (npm run test:release). It fails until the placeholders are replaced,
// so a build with a dead LinkedIn link or a missing resume can't be shipped by accident.
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

  test("SITE_URL is the production origin", () => {
    expect(process.env.SITE_URL).toMatch(/^https:\/\//);
  });
});
