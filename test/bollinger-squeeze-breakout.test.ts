import assert from "node:assert/strict";
import test from "node:test";

import type { Candle } from "../src/market-data/candle.js";
import { BollingerSqueezeBreakoutStrategy } from "../src/strategies/bollinger-squeeze-breakout.js";

const context = {
  account: { balance: "1000", equity: "1000" },
  position: null,
};

function candle(
  index: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    openTime: index * 60_000,
    open: "100",
    high: String(high),
    low: String(low),
    close: String(close),
    volume: "1",
    turnover: String(close),
  };
}

function compressedMarket() {
  return [
    candle(0, 101, 99, 100),
    candle(1, 102, 99, 101),
    candle(2, 101, 98, 99),
    candle(3, 100.5, 99.5, 100),
    candle(4, 100.5, 99.5, 100),
    candle(5, 100.5, 99.5, 100),
  ];
}

function strategy() {
  return new BollingerSqueezeBreakoutStrategy({
    bollingerPeriod: 3,
    squeezeLookback: 3,
    squeezePercentile: 34,
    atrPeriod: 2,
    atrExpansion: "1.5",
    stopAtrMultiplier: "1.5",
  });
}

test("Bollinger squeeze enters long after compression and ATR expansion", () => {
  const subject = strategy();
  const signals = compressedMarket().map((item) =>
    subject.onCandle(item, context),
  );
  const breakout = subject.onCandle(candle(6, 104, 99.5, 103), context);

  assert.equal(
    signals.every((signal) => signal === null),
    true,
  );
  assert.equal(breakout?.direction, "LONG");
  assert.equal(Number(breakout?.stopLoss) < 103, true);
  assert.equal(Number(breakout?.takeProfit) > 103, true);
});

test("Bollinger squeeze rejects a breakout without ATR expansion", () => {
  const subject = strategy();
  compressedMarket().forEach((item) => subject.onCandle(item, context));

  assert.equal(subject.onCandle(candle(6, 101.2, 100, 101.1), context), null);
});

test("Bollinger squeeze supports downside breakouts", () => {
  const subject = strategy();
  compressedMarket().forEach((item) => subject.onCandle(item, context));
  const breakout = subject.onCandle(candle(6, 100.5, 96, 97), context);

  assert.equal(breakout?.direction, "SHORT");
  assert.equal(Number(breakout?.stopLoss) > 97, true);
  assert.equal(Number(breakout?.takeProfit) < 97, true);
});
