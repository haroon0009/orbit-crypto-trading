import assert from "node:assert/strict";
import test from "node:test";

import { botAssignmentSchema } from "../src/persistence/bots.js";

const valid = {
  name: "BTC trend",
  exchange: "BYBIT",
  symbol: "btcusdt",
  interval: "15",
  strategyId: "EMA_CROSS",
  strategyVersion: "1.0.0",
  totalCapital: "1000",
  minTradeAmount: "100",
  maxTradeAmount: "200",
  leverage: "2",
  stopLossPercent: "1",
  takeProfitPercent: "2",
};

test("bot assignments normalize valid input and reject unsafe capital limits", () => {
  assert.deepEqual(botAssignmentSchema.parse(valid).symbol, "BTCUSDT");
  assert.throws(
    () =>
      botAssignmentSchema.parse({
        ...valid,
        maxTradeAmount: "1200",
      }),
    /cannot exceed total capital/,
  );
});
