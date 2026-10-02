import assert from "node:assert/strict";
import test from "node:test";

import { runBacktest } from "../src/backtest/engine.js";
import type { Signal } from "../src/domain/trading.js";
import type { Candle } from "../src/market-data/candle.js";
import type { Strategy } from "../src/strategies/strategy.js";

const start = Date.UTC(2026, 0, 1);
const duration = 60_000;

class TrailingFixtureStrategy implements Strategy {
  readonly id = "TRAILING_FIXTURE";
  readonly version = "1";
  private trailRequests = 0;

  onCandle(candle: Readonly<Candle>): Signal | null {
    return candle.openTime === start
      ? {
          direction: "LONG",
          stopLoss: "90",
          takeProfit: "200",
          generatedAt: candle.openTime,
        }
      : null;
  }

  trailingStop(): string | null {
    this.trailRequests += 1;
    return this.trailRequests === 1 ? null : "101";
  }
}

test("backtest applies a tighter strategy stop before the next candle exits", () => {
  const candles: Candle[] = [
    { open: "100", high: "101", low: "99", close: "100" },
    { open: "100", high: "105", low: "99", close: "104" },
    { open: "102", high: "103", low: "100", close: "101" },
    { open: "101", high: "102", low: "100", close: "101" },
  ].map((prices, index) => ({
    openTime: start + index * duration,
    ...prices,
    volume: "1",
    turnover: "100",
  }));
  const result = runBacktest({
    candles,
    strategy: new TrailingFixtureStrategy(),
    symbol: "TESTUSDT",
    interval: "1",
    config: {
      startingBalance: "1000",
      feeRate: "0",
      slippageBps: "0",
      closeOpenPositionAtEnd: true,
      risk: {
        allocation: "1000",
        leverage: "1",
        sizing: { type: "FIXED_AMOUNT", amount: "100" },
        instrument: {
          tickSize: "1",
          quantityStep: "1",
          minQuantity: "1",
          minNotional: "1",
          maxLeverage: "1",
        },
        policy: {
          maxLeverage: "1",
          maxNotional: "1000",
          maxOpenPositions: 1,
          maxDailyLoss: "1000",
        },
      },
    },
  });

  assert.equal(result.trades[0]?.exitReason, "STOP_LOSS");
  assert.equal(result.trades[0]?.exit.price, "101");
  assert.equal(result.trades[0]?.stopLoss, "101");
});
