import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// public/_headers is applied by Cloudflare's static asset serving.
test("hashed assets are cached forever, and every response carries the security headers", () => {
  const headers = readFileSync("public/_headers", "utf8");
  expect(headers).toMatch(
    /^\/_astro\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m,
  );
  for (const header of [
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Content-Security-Policy: frame-ancestors 'none'",
    "X-Frame-Options: DENY",
    "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  ]) {
    expect(headers).toContain(header);
  }
});
