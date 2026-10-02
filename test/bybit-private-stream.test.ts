import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BybitPrivateStream,
  type PrivateStreamEvent,
} from "../src/exchanges/bybit/private-stream.js";

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.onclose?.();
  }

  emit(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

describe("BybitPrivateStream", () => {
  it("authenticates, subscribes to all private state, and dispatches serially", async () => {
    const socket = new FakeSocket();
    const now = 1_700_000_000_000;
    const controller = new AbortController();
    const events: PrivateStreamEvent[] = [];
    let reconnects = 0;
    const stream = new BybitPrivateStream(
      { apiKey: "key", apiSecret: "secret" },
      () => socket,
      () => now,
      0,
    );
    const running = stream.subscribe(
      async (event) => {
        events.push(event);
      },
      async () => {
        reconnects++;
      },
      controller.signal,
    );

    socket.onopen?.();
    const auth = JSON.parse(socket.sent[0] ?? "") as {
      args: [string, number, string];
    };
    assert.equal(auth.args[0], "key");
    assert.equal(
      auth.args[2],
      createHmac("sha256", "secret")
        .update(`GET/realtime${auth.args[1]}`)
        .digest("hex"),
    );
    socket.emit({ success: true, ret_msg: "", op: "auth" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(reconnects, 1);
    assert.deepEqual(JSON.parse(socket.sent[1] ?? "").args, [
      "order",
      "execution",
      "position",
      "wallet",
    ]);

    for (const topic of ["order", "execution", "position", "wallet"]) {
      socket.emit({ topic, creationTime: now, data: [{}] });
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();
    await running;
    assert.deepEqual(
      events.map((event) => event.topic),
      ["order", "execution", "position", "wallet"],
    );
  });
});
