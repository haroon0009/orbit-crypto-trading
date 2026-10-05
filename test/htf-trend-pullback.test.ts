import assert from "node:assert/strict";
import test from "node:test";

import { Decimal } from "decimal.js";

import type { Candle } from "../src/market-data/candle.js";
import { HtfTrendPullbackStrategy } from "../src/strategies/htf-trend-pullback.js";

const context = {
  account: { balance: "1000", equity: "1000" },
  position: null,
};

function candle(
  index: number,
  close: number,
  high = close + 1,
  low = close - 1,
): Candle {
  return {
    openTime: index * 3_600_000,
    open: String(close),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: "1",
    turnover: String(close),
  };
}

function strategy() {
  return new HtfTrendPullbackStrategy({
    higherTimeframeMinutes: 120,
    higherFastPeriod: 2,
    higherSlowPeriod: 3,
    entryEmaPeriod: 2,
    atrPeriod: 2,
    confirmationBars: 2,
    atrMultiplier: "1.5",
    rewardRisk: "2",
  });
}

test("HTF pullback confirms a long only after a completed higher-timeframe uptrend", () => {
  const subject = strategy();
  const warmup = [99, 100, 102, 104, 106, 108].map((close, index) =>
    subject.onCandle(candle(index, close), context),
  );
  const setup = subject.onCandle(candle(6, 107, 108, 105), context);
  const signal = subject.onCandle(candle(7, 110, 111, 107), context);

  assert.equal(
    warmup.every((item) => item === null),
    true,
  );
  assert.equal(setup, null);
  assert.equal(signal?.direction, "LONG");
  assert.equal(signal?.generatedAt, 7 * 3_600_000);
  const entry = new Decimal(110);
  const risk = entry.minus(signal!.stopLoss);
  const reward = new Decimal(signal!.takeProfit).minus(entry);
  assert.equal(reward.eq(risk.mul(2)), true);
});

test("HTF pullback supports confirmations inside a completed downtrend", () => {
  const subject = strategy();
  [111, 110, 108, 106, 104, 102].forEach((close, index) =>
    subject.onCandle(candle(index, close), context),
  );
  subject.onCandle(candle(6, 103, 105, 102), context);
  const signal = subject.onCandle(candle(7, 100, 103, 99), context);

  assert.equal(signal?.direction, "SHORT");
  assert.equal(Number(signal?.stopLoss) > 100, true);
  assert.equal(Number(signal?.takeProfit) < 100, true);
});

test("HTF pullback refuses a lower-timeframe reversal against the higher trend", () => {
  const subject = strategy();
  const candles = [99, 100, 102, 104, 106, 108, 106, 103].map((close, index) =>
    candle(index, close, close + 2, close - 1),
  );

  assert.equal(
    candles.every((item) => subject.onCandle(item, context) === null),
    true,
  );
});
