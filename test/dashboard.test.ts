import assert from "node:assert/strict";
import test from "node:test";

import { parseDashboardQuery } from "../src/ui/dashboard.js";

test("dashboard query accepts supported markets and rejects invalid input", () => {
  assert.deepEqual(
    parseDashboardQuery(new URL("http://localhost?symbol=ethusdt&interval=60")),
    { symbol: "ETHUSDT", interval: 60 },
  );
  assert.throws(
    () => parseDashboardQuery(new URL("http://localhost?symbol=BTC/USDT")),
    /Invalid symbol/,
  );
  assert.throws(
    () => parseDashboardQuery(new URL("http://localhost?interval=7")),
    /Unsupported interval/,
  );
});
