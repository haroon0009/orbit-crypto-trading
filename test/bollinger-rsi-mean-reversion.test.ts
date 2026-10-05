import assert from "node:assert/strict";
import test from "node:test";

import type { Candle } from "../src/market-data/candle.js";
import { BollingerRsiMeanReversionStrategy } from "../src/strategies/bollinger-rsi-mean-reversion.js";

const context = {
  account: { balance: "1000", equity: "1000" },
  position: null,
};

function candle(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    openTime: index * 60_000,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: "1",
    turnover: String(close),
  };
}

const longCandles = [
  candle(0, 100, 101, 99, 100),
  candle(1, 100, 103, 100, 101),
  candle(2, 101, 104, 101, 100),
  candle(3, 100, 104, 98, 100),
];

test("Bollinger RSI enters after a lower-band rejection in a range", () => {
  const strategy = new BollingerRsiMeanReversionStrategy({
    bollingerPeriod: 3,
    rsiPeriod: 2,
    adxPeriod: 2,
    maxAdx: "100",
    rsiOversold: "60",
  });
  const signals = longCandles.map((item) => strategy.onCandle(item, context));

  assert.equal(
    signals.slice(0, -1).every((signal) => signal === null),
    true,
  );
  assert.equal(signals.at(-1)?.direction, "LONG");
  assert.equal(Number(signals.at(-1)?.stopLoss) < 98, true);
  assert.equal(Number(signals.at(-1)?.takeProfit) > 100, true);
});

test("Bollinger RSI rejects the same setup when ADX detects a trend", () => {
  const strategy = new BollingerRsiMeanReversionStrategy({
    bollingerPeriod: 3,
    rsiPeriod: 2,
    adxPeriod: 2,
    maxAdx: "20",
    rsiOversold: "60",
  });

  assert.equal(
    longCandles.every((item) => strategy.onCandle(item, context) === null),
    true,
  );
});

test("Bollinger RSI supports upper-band rejection shorts", () => {
  const strategy = new BollingerRsiMeanReversionStrategy({
    bollingerPeriod: 3,
    rsiPeriod: 2,
    adxPeriod: 2,
    maxAdx: "100",
    rsiOverbought: "40",
  });
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 100, 97, 99),
    candle(2, 99, 101, 96, 100),
    candle(3, 100, 102, 96, 100),
  ];
  const signals = candles.map((item) => strategy.onCandle(item, context));

  assert.equal(signals.at(-1)?.direction, "SHORT");
  assert.equal(Number(signals.at(-1)?.stopLoss) > 102, true);
  assert.equal(Number(signals.at(-1)?.takeProfit) < 100, true);
});
