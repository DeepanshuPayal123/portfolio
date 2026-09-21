import { formatMessage, validate } from "../../src/lib/contact";

// Cloudflare Pages Function behind the contact form. The bot token lives here as a Pages
// secret and never reaches the browser.

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

interface Context {
  request: Request;
  env: Env;
}

const RATE_LIMIT_SECONDS = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** One message per IP per window. Uses the edge cache, which every colo has. */
async function rateLimited(ip: string): Promise<boolean> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches
    ?.default;
  if (!cache) return false;
  const key = new Request(
    `https://portfolio.invalid/contact-rate/${encodeURIComponent(ip)}`,
  );
  if (await cache.match(key)) return true;
  await cache.put(
    key,
    new Response("1", {
      headers: { "cache-control": `max-age=${RATE_LIMIT_SECONDS}` },
    }),
  );
  return false;
}

export async function onRequestPost({
  request,
  env,
}: Context): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }

  // Bots fill in every field they find; this one is invisible to people.
  if (typeof payload.company === "string" && payload.company.trim() !== "")
    return json({ ok: true });

  const submission: Submission = {
    name: String(payload.name ?? ""),
    contact: String(payload.contact ?? ""),
    message: String(payload.message ?? ""),
  };

  const { ok, errors } = validate(submission);
  if (!ok) return json({ ok: false, errors }, 400);

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    return json({ ok: false, error: "not-configured" }, 500);

  if (await rateLimited(request.headers.get("cf-connecting-ip") ?? "unknown")) {
    return json({ ok: false, error: "too-many" }, 429);
  }

  const text = formatMessage(submission, {
    ref: new URL(request.url).searchParams.get("ref"),
    country: request.headers.get("cf-ipcountry"),
    at: new Date(),
  });

  const sent = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    },
  );
  if (!sent.ok) return json({ ok: false, error: "telegram" }, 502);

  return json({ ok: true });
}

type Submission = import("../../src/lib/contact").Submission;
