import { beforeEach, describe, expect, test, vi } from "vitest";
import { formatMessage, validate } from "@/lib/contact";
import { onRequestPost } from "../../functions/api/contact";

describe("validation", () => {
  const good = {
    name: "Rahul Verma",
    contact: "rahul@corp.com",
    message: "We are hiring backend engineers — are you free to chat?",
  };

  test("accepts a complete message", () => {
    expect(validate(good)).toEqual({ ok: true, errors: {} });
  });

  test("accepts a phone number instead of an email", () => {
    expect(validate({ ...good, contact: "+91 98765 43210" }).ok).toBe(true);
    expect(validate({ ...good, contact: "9876543210" }).ok).toBe(true);
  });

  test("asks for what is missing", () => {
    const { ok, errors } = validate({ name: " ", contact: "", message: "hi" });
    expect(ok).toBe(false);
    expect(errors.name).toMatch(/name/i);
    expect(errors.contact).toMatch(/email|phone/i);
    expect(errors.message).toMatch(/short|longer/i);
  });

  test("rejects something that is neither an email nor a phone number", () => {
    expect(
      validate({ ...good, contact: "telegram: @someone" }).errors.contact,
    ).toMatch(/email|phone/i);
  });

  test("refuses a message longer than the limit", () => {
    expect(
      validate({ ...good, message: "x".repeat(2001) }).errors.message,
    ).toMatch(/long/i);
  });
});

describe("the Telegram text", () => {
  const at = new Date("2026-09-21T09:30:00Z");

  test("carries who wrote, how to reach them, and where they came from", () => {
    const text = formatMessage(
      {
        name: "Rahul Verma",
        contact: "rahul@corp.com",
        message: "Are you free to chat?",
      },
      { ref: "barco", country: "IN", at },
    );
    expect(text).toContain("Rahul Verma");
    expect(text).toContain("rahul@corp.com");
    expect(text).toContain("Are you free to chat?");
    expect(text).toContain("barco");
    expect(text).toContain("IN");
    expect(text).toMatch(/15:00|3:00/); // 09:30 UTC shown in IST
  });

  test("works when the visitor arrived without a ref", () => {
    const text = formatMessage(
      { name: "A", contact: "a@b.com", message: "hi there friend" },
      { ref: null, country: null, at },
    );
    expect(text).not.toMatch(/undefined|null/);
  });
});

describe("the endpoint", () => {
  const env = { TELEGRAM_BOT_TOKEN: "token123", TELEGRAM_CHAT_ID: "4242" };
  const body = {
    name: "Rahul Verma",
    contact: "rahul@corp.com",
    message: "We are hiring — free to chat?",
  };
  const post = (
    payload: unknown,
    headers: Record<string, string> = {},
    envOverride = env,
  ) =>
    onRequestPost({
      request: new Request("https://deepanshupayal.pages.dev/api/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "1.2.3.4",
          ...headers,
        },
        body: JSON.stringify(payload),
      }),
      env: envOverride,
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    );
  });

  test("sends the message to the configured chat", async () => {
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain("/bottoken123/sendMessage");
    const sent = JSON.parse(String((init as RequestInit).body));
    expect(sent.chat_id).toBe("4242");
    expect(sent.text).toContain("Rahul Verma");
  });

  test("refuses an incomplete message and says which field", async () => {
    const response = await post({ ...body, contact: "nope" });
    expect(response.status).toBe(400);
    expect((await response.json()).errors.contact).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a filled honeypot looks accepted but sends nothing", async () => {
    const response = await post({ ...body, company: "spam corp" });
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("says so when the bot is not configured", async () => {
    const response = await post(
      body,
      {},
      { TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" },
    );
    expect(response.status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("reports a Telegram outage instead of pretending it worked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, description: "chat not found" }),
            { status: 400 },
          ),
      ),
    );
    const response = await post(body);
    expect(response.status).toBe(502);
  });

  test("rejects malformed JSON", async () => {
    const response = await onRequestPost({
      request: new Request("https://deepanshupayal.pages.dev/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      }),
      env,
    });
    expect(response.status).toBe(400);
  });

  test("one message per visitor at a time", async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal("caches", {
      default: {
        match: async (key: Request) => store.get(key.url),
        put: async (key: Request, value: Response) =>
          void store.set(key.url, value),
      },
    });

    expect((await post(body)).status).toBe(200);
    const second = await post(body);
    expect(second.status).toBe(429);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
