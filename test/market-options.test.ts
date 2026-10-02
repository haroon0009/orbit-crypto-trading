import assert from "node:assert/strict";
import test from "node:test";

import { historicalMarketOptions } from "../web/src/market-options.js";

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
