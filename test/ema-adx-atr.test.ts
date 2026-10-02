import assert from "node:assert/strict";
import test from "node:test";

import { Decimal } from "decimal.js";

import type { Candle } from "../src/market-data/candle.js";
import { EmaAdxAtrStrategy } from "../src/strategies/ema-adx-atr.js";

const context = {
  account: { balance: "1000", equity: "1000" },
  position: null,
};

function candle(close: number, index: number): Candle {
  return {
    openTime: index * 60_000,
    open: String(close),
    high: String(close + 1),
    low: String(close - 1),
    close: String(close),
    volume: "1",
    turnover: String(close),
  };
}

test("EMA ADX ATR requires a setup and a later same-trend confirmation", () => {
  const strategy = new EmaAdxAtrStrategy({
    fastPeriod: 2,
    slowPeriod: 4,
    indicatorPeriod: 3,
    minimumAdx: "10",
    atrMultiplier: "1.5",
    rewardRisk: "2",
  });
  const closes = [100, 102, 104, 106, 108, 110, 108, 109, 111];
  const signals = closes.map((close, index) =>
    strategy.onCandle(candle(close, index), context),
  );

  assert.equal(
    signals.slice(0, -1).every((signal) => signal === null),
    true,
  );
  const signal = signals.at(-1);
  assert.equal(signal?.direction, "LONG");
  assert.equal(signal?.generatedAt, 8 * 60_000);
  const entry = new Decimal("111");
  const risk = entry.minus(signal!.stopLoss);
  const reward = new Decimal(signal!.takeProfit).minus(entry);
  assert.equal(reward.minus(risk.mul(2)).abs().lt("0.000000000000001"), true);
});

test("EMA ADX ATR cancels a setup when its trend fails before confirmation", () => {
  const strategy = new EmaAdxAtrStrategy({
    fastPeriod: 2,
    slowPeriod: 4,
    indicatorPeriod: 3,
    minimumAdx: "10",
  });
  const closes = [100, 102, 104, 106, 108, 110, 108, 104, 112];
  const signals = closes.map((close, index) =>
    strategy.onCandle(candle(close, index), context),
  );

  assert.equal(
    signals.every((signal) => signal === null),
    true,
  );
});

test("EMA ADX ATR confirms short setups only inside a falling trend", () => {
  const strategy = new EmaAdxAtrStrategy({
    fastPeriod: 2,
    slowPeriod: 4,
    indicatorPeriod: 3,
    minimumAdx: "10",
  });
  const closes = [112, 110, 108, 106, 104, 102, 104, 103, 101];
  const signals = closes.map((close, index) =>
    strategy.onCandle(candle(close, index), context),
  );

  assert.equal(
    signals.slice(0, -1).every((signal) => signal === null),
    true,
  );
  assert.equal(signals.at(-1)?.direction, "SHORT");
});

test("EMA ADX ATR rejects invalid periods and risk settings", () => {
  assert.throws(
    () => new EmaAdxAtrStrategy({ fastPeriod: 20, slowPeriod: 20 }),
    /Invalid EMA periods/,
  );
  assert.throws(
    () => new EmaAdxAtrStrategy({ atrMultiplier: "0" }),
    /Invalid ATR protection/,
  );
  assert.throws(
    () => new EmaAdxAtrStrategy({ confirmationBars: 0 }),
    /Invalid confirmation window/,
  );
});

test("EMA ADX ATR recovers after a flat market", () => {
  const strategy = new EmaAdxAtrStrategy({
    fastPeriod: 2,
    slowPeriod: 4,
    indicatorPeriod: 3,
    minimumAdx: "10",
  });
  const closes = [100, 100, 100, 100, 100, 100, 102, 104, 106, 104, 108];
  const signals = closes.map((close, index) =>
    strategy.onCandle(candle(close, index), context),
  );

  assert.equal(signals.at(-1)?.direction, "LONG");
});
