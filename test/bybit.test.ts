import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BybitMarketDataClient } from "../src/exchanges/bybit/market-data.js";

const request = {
  symbol: "BTCUSDT",
  interval: "15" as const,
  start: 0,
  end: 900_000,
};

describe("BybitMarketDataClient", () => {
  it("reports an exchange error before parsing its empty result", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({ retCode: 10001, retMsg: "bad request", result: {} }),
        { status: 200 },
      );

    await assert.rejects(
      new BybitMarketDataClient(fetcher).getKlines(request),
      /Bybit 10001: bad request/,
    );
  });

  it("normalizes Bybit's newest-first response", async () => {
    const row = (openTime: string) => [
      openTime,
      "100",
      "101",
      "99",
      "100.5",
      "2",
      "200",
    ];
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          retMsg: "OK",
          result: { list: [row("900000"), row("0")] },
        }),
        { status: 200 },
      );

    const candles = await new BybitMarketDataClient(fetcher).getKlines(request);

    assert.deepEqual(
      candles.map((candle) => candle.openTime),
      [0, 900_000],
    );
  });
});
