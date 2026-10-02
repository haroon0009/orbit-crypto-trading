import assert from "node:assert/strict";
import test from "node:test";

import { Decimal } from "decimal.js";

import type { Position } from "../src/domain/trading.js";
import type { Candle } from "../src/market-data/candle.js";
import { DonchianAtrStrategy } from "../src/strategies/donchian-atr.js";

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

test("Donchian ATR enters only after closing beyond the previous channel", () => {
  const strategy = new DonchianAtrStrategy({
    channelPeriod: 3,
    atrPeriod: 3,
    atrMultiplier: "2",
    rewardRisk: "10",
  });
  const candles = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 102, 100, 101),
    candle(2, 101, 103, 101, 102),
    candle(3, 102, 105, 102, 104),
  ];
  const signals = candles.map((item) => strategy.onCandle(item, context));

  assert.equal(
    signals.slice(0, -1).every((signal) => signal === null),
    true,
  );
  assert.equal(signals.at(-1)?.direction, "LONG");
  assert.equal(
    new Decimal(signals.at(-1)!.takeProfit).gt(
      new Decimal(signals.at(-1)!.stopLoss),
    ),
    true,
  );
});

test("Donchian ATR trails behind the best price without loosening", () => {
  const strategy = new DonchianAtrStrategy({
    channelPeriod: 3,
    atrPeriod: 3,
    atrMultiplier: "2",
  });
  const warmup = [
    candle(0, 100, 101, 99, 100),
    candle(1, 100, 102, 100, 101),
    candle(2, 101, 103, 101, 102),
    candle(3, 102, 105, 102, 104),
  ];
  const signal = warmup.map((item) => strategy.onCandle(item, context)).at(-1)!;
  const position: Position = {
    direction: "LONG",
    quantity: "1",
    entry: {
      orderId: "entry",
      side: "BUY",
      price: "104",
      quantity: "1",
      fee: "0",
      timestamp: 4 * 60_000,
    },
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    reservedCapital: "104",
  };

  strategy.onCandle(candle(4, 104, 112, 103, 111), {
    ...context,
    position,
  });
  const firstTrail = strategy.trailingStop(position)!;
  strategy.onCandle(candle(5, 111, 111, 106, 107), {
    ...context,
    position: { ...position, stopLoss: firstTrail },
  });

  assert.equal(new Decimal(firstTrail).gt(position.stopLoss), true);
  assert.equal(
    strategy.trailingStop(position),
    firstTrail,
    "the trailing stop must never move away from price",
  );
});
