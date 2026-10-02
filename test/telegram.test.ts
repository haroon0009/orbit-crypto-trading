import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TelegramNotifier } from "../src/notifications/telegram.js";

describe("TelegramNotifier", () => {
  it("sends a critical alert without exposing credentials in the payload", async () => {
    let request: { url: string; body: string } | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      request = { url: input.toString(), body: String(init?.body) };
      return new Response(JSON.stringify({ ok: true }));
    };

    await new TelegramNotifier("secret-token", "chat-1", fetcher).send(
      "stop-loss",
    );

    assert.equal(request?.url.includes("secret-token"), true);
    assert.deepEqual(JSON.parse(request?.body ?? ""), {
      chat_id: "chat-1",
      text: "stop-loss",
    });
    assert.equal(request?.body.includes("secret-token"), false);
  });
});
