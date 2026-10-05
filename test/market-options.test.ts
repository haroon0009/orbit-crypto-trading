import assert from "node:assert/strict";
import test from "node:test";

import {
  historicalMarketOptions,
  historicalStartDate,
} from "../web/src/market-options.js";

test("historical market options group downloaded timeframes by ticker", () => {
  assert.deepEqual(
    historicalMarketOptions([
      { symbol: "BTCUSDT", interval_minutes: 60 },
      { symbol: "ETHUSDT", interval_minutes: 15 },
      { symbol: "BTCUSDT", interval_minutes: 15 },
      { symbol: "BTCUSDT", interval_minutes: 15 },
    ]),
    [
      { symbol: "BTCUSDT", intervals: [15, 60] },
      { symbol: "ETHUSDT", intervals: [15] },
    ],
  );
});

test("historical start date follows the selected ticker and timeframe", () => {
  const datasets = [
    {
      symbol: "BTCUSDT",
      interval_minutes: 60,
      start_time: "2024-01-02T00:00:00.000Z",
    },
    {
      symbol: "BTCUSDT",
      interval_minutes: 15,
      start_time: "2023-06-10T12:15:00.000Z",
    },
  ];

  assert.equal(historicalStartDate(datasets, "BTCUSDT", 15), "2023-06-10");
  assert.equal(historicalStartDate(datasets, "BTCUSDT", 60), "2024-01-02");
  assert.equal(historicalStartDate(datasets, "ETHUSDT", 60), "");
});
