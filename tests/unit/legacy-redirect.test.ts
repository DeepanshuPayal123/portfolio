import { describe, expect, test } from "vitest";
import worker from "../../workers/legacy-redirect/index";

// The old workers.dev address may already be in sent applications; it must keep working.
describe("legacy workers.dev redirect", () => {
  const old = "https://deepanshu-portfolio.deepanshu-portfolio.workers.dev";

  test("sends a path and its query to the same place on the new origin, permanently", () => {
    const res = worker.fetch(new Request(`${old}/resume?ref=barco`));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(
      "https://deepanshupayal.pages.dev/resume?ref=barco",
    );
  });

  test("the root goes to the root", () => {
    const res = worker.fetch(new Request(`${old}/`));
    expect(res.headers.get("location")).toBe(
      "https://deepanshupayal.pages.dev/",
    );
  });
});
