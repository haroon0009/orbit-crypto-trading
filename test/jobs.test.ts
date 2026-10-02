import assert from "node:assert/strict";
import test from "node:test";

import { completedCandleEnd } from "../src/jobs/system.js";

test("historical sync excludes the currently forming candle", () => {
  const now = Date.UTC(2026, 9, 2, 10, 17, 30);
  assert.equal(completedCandleEnd("15", now), Date.UTC(2026, 9, 2, 10, 15));
});
