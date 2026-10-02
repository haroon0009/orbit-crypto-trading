import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BybitTestnetAdapter,
  deterministicClientOrderId,
} from "../src/exchanges/bybit/testnet.js";

const credentials = { apiKey: "test-key", apiSecret: "test-secret" };

describe("BybitTestnetAdapter", () => {
  it("loads and caches instrument rules", async () => {
    let requests = 0;
    const fetcher: typeof fetch = async (input) => {
      requests++;
      assert.equal(new URL(input.toString()).host, "api-testnet.bybit.com");
      return new Response(
        JSON.stringify({
          retCode: 0,
          retMsg: "OK",
          result: {
            list: [
              {
                symbol: "BTCUSDT",
                status: "Trading",
                leverageFilter: { maxLeverage: "100" },
                priceFilter: { tickSize: "0.1" },
                lotSizeFilter: {
                  minOrderQty: "0.001",
                  qtyStep: "0.001",
                  minNotionalValue: "5",
                },
              },
            ],
          },
        }),
      );
    };
    const adapter = new BybitTestnetAdapter(credentials, fetcher);

    const first = await adapter.getInstrumentRules("BTCUSDT");
    const second = await adapter.getInstrumentRules("BTCUSDT");

    assert.deepEqual(first, second);
    assert.equal(first.tickSize, "0.1");
    assert.equal(requests, 1);
  });

  it("retries rate limits and signs an idempotent testnet order", async () => {
    const timestamp = 1_700_000_000_000;
    const waits: number[] = [];
    const requests: Array<{ body: string; headers: Headers }> = [];
    const fetcher: typeof fetch = async (_input, init) => {
      const body = String(init?.body);
      const headers = new Headers(init?.headers);
      requests.push({ body, headers });
      if (requests.length === 1) {
        return new Response(
          JSON.stringify({ retCode: 10006, retMsg: "rate limit", result: {} }),
        );
      }
      const parsed = JSON.parse(body) as { orderLinkId: string };
      return new Response(
        JSON.stringify({
          retCode: 0,
          retMsg: "OK",
          result: {
            orderId: "exchange-order",
            orderLinkId: parsed.orderLinkId,
          },
        }),
      );
    };
    const adapter = new BybitTestnetAdapter(
      credentials,
      fetcher,
      () => timestamp,
      async (milliseconds) => waits.push(milliseconds),
    );
    const order = {
      symbol: "BTCUSDT",
      side: "BUY" as const,
      type: "MARKET" as const,
      quantity: "0.001",
      idempotencyKey: "strategy:signal:1700000000000",
    };

    const acknowledgement = await adapter.placeOrder(order);
    const expectedId = deterministicClientOrderId(order);
    const last = requests.at(-1);
    assert.ok(last);
    const expectedSignature = createHmac("sha256", credentials.apiSecret)
      .update(`${timestamp}${credentials.apiKey}5000${last.body}`)
      .digest("hex");

    assert.equal(requests.length, 2);
    assert.deepEqual(waits, [250]);
    assert.equal(last.headers.get("X-BAPI-SIGN"), expectedSignature);
    assert.equal(acknowledgement.clientOrderId, expectedId);
    assert.equal(expectedId.length, 36);
  });

  it("reconciles wallet, orders, fills, and position with signed GETs", async () => {
    const timestamp = 1_700_000_000_000;
    const signed: Array<{ url: URL; headers: Headers }> = [];
    let hedgeMode = false;
    const envelope = (result: unknown) =>
      new Response(JSON.stringify({ retCode: 0, retMsg: "OK", result }));
    const order = {
      orderId: "order-1",
      orderLinkId: "bot-order",
      side: "Buy",
      orderStatus: "PartiallyFilled",
      qty: "2",
      cumExecQty: "1",
      reduceOnly: false,
    };
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(input.toString());
      signed.push({ url, headers: new Headers(init?.headers) });
      switch (url.pathname) {
        case "/v5/order/realtime":
          return envelope({ list: [order] });
        case "/v5/order/history":
          return envelope({ list: [] });
        case "/v5/execution/list":
          return envelope({
            list: [
              {
                execId: "fill-1",
                orderId: "order-1",
                orderLinkId: "bot-order",
                side: "Buy",
                execPrice: "100",
                execQty: "1",
                execFee: "0.1",
                execTime: String(timestamp),
              },
            ],
          });
        case "/v5/position/list":
          return envelope({
            list: [
              {
                symbol: "BTCUSDT",
                side: "Buy",
                size: "1",
                avgPrice: "100",
                stopLoss: "98",
                takeProfit: "104",
                positionIdx: hedgeMode ? 1 : 0,
              },
            ],
          });
        case "/v5/account/wallet-balance":
          return envelope({ list: [{ totalWalletBalance: "1000" }] });
        default:
          throw new Error(`Unexpected path: ${url.pathname}`);
      }
    };
    const adapter = new BybitTestnetAdapter(
      credentials,
      fetcher,
      () => timestamp,
    );

    const snapshot = await adapter.getSnapshot("BTCUSDT");

    assert.equal(snapshot.walletBalance, "1000");
    assert.equal(snapshot.orders[0]?.status, "PARTIALLY_FILLED");
    assert.equal(snapshot.fills[0]?.executionId, "fill-1");
    assert.equal(snapshot.position?.direction, "LONG");
    for (const request of signed) {
      const expected = createHmac("sha256", credentials.apiSecret)
        .update(
          `${timestamp}${credentials.apiKey}5000${request.url.searchParams.toString()}`,
        )
        .digest("hex");
      assert.equal(request.headers.get("X-BAPI-SIGN"), expected);
    }
    hedgeMode = true;
    await assert.rejects(
      () => adapter.getSnapshot("BTCUSDT"),
      /hedge-mode positions are not supported/,
    );
  });
});
