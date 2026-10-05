import assert from "node:assert/strict";
import test from "node:test";

import { createStrategyVersion } from "../src/strategies/catalog.js";

test("strategy catalog creates registered versions and rejects unknown ones", () => {
  const strategy = createStrategyVersion({
    strategyId: "EMA_ADX_ATR",
    strategyVersion: "1.0.0",
    configuration: {
      fastPeriod: 10,
      slowPeriod: 30,
      indicatorPeriod: 12,
      minimumAdx: "20",
      atrMultiplier: "2",
      rewardRisk: "3",
    },
    stopLossPercent: "1",
    takeProfitPercent: "2",
  });

  assert.equal(strategy.id, "EMA_ADX_ATR");
  assert.equal(strategy.version, "1.0.0");
  assert.equal(
    createStrategyVersion({
      strategyId: "DONCHIAN_ATR",
      strategyVersion: "1.0.0",
      configuration: {},
      stopLossPercent: "1",
      takeProfitPercent: "2",
    }).id,
    "DONCHIAN_ATR",
  );
  assert.equal(
    createStrategyVersion({
      strategyId: "BB_RSI_MEAN_REVERSION",
      strategyVersion: "1.0.0",
      configuration: {},
      stopLossPercent: "1",
      takeProfitPercent: "2",
    }).id,
    "BB_RSI_MEAN_REVERSION",
  );
  assert.equal(
    createStrategyVersion({
      strategyId: "BB_SQUEEZE_BREAKOUT",
      strategyVersion: "1.0.0",
      configuration: {},
      stopLossPercent: "1",
      takeProfitPercent: "2",
    }).id,
    "BB_SQUEEZE_BREAKOUT",
  );
  assert.equal(
    createStrategyVersion({
      strategyId: "HTF_TREND_PULLBACK",
      strategyVersion: "1.0.0",
      configuration: {},
      stopLossPercent: "1",
      takeProfitPercent: "2",
    }).id,
    "HTF_TREND_PULLBACK",
  );
  assert.throws(
    () =>
      createStrategyVersion({
        strategyId: "UNKNOWN",
        strategyVersion: "1.0.0",
        configuration: {},
        stopLossPercent: "1",
        takeProfitPercent: "2",
      }),
    /Unsupported strategy version/,
  );
});
