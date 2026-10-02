import assert from "node:assert/strict";
import test from "node:test";

import type { Candle } from "../src/market-data/candle.js";
import { EmaCrossStrategy } from "../src/strategies/ema-cross.js";

test("EMA crossover waits for history and emits a protected next-candle signal", () => {
  const strategy = new EmaCrossStrategy(2, 3, "1", "2");
  const closes = ["10", "9", "8", "9", "11"];
  const signals = closes.map((close, index) =>
    strategy.onCandle(
      {
        openTime: index * 60_000,
        open: close,
        high: close,
        low: close,
        close,
        volume: "1",
        turnover: close,
      } satisfies Candle,
      { account: { balance: "1000", equity: "1000" }, position: null },
    ),
  );

  assert.equal(
    signals.slice(0, 4).every((signal) => signal === null),
    true,
  );
  assert.deepEqual(signals[4], {
    direction: "LONG",
    stopLoss: "10.89",
    takeProfit: "11.22",
    generatedAt: 240_000,
  });
});
