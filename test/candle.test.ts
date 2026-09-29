import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateCandle, type Candle } from "../src/market-data/candle.js";

const valid: Candle = {
  openTime: Date.UTC(2026, 0, 1),
  open: "100.000000000000000001",
  high: "101.000000000000000001",
  low: "99.000000000000000001",
  close: "100.500000000000000001",
  volume: "2.5",
  turnover: "250.25",
};

describe("validateCandle", () => {
  it("validates decimal values without converting them to numbers", () => {
    assert.equal(validateCandle(valid, "15"), valid);
  });

  it("rejects impossible OHLC values", () => {
    assert.throws(() => validateCandle({ ...valid, high: "99" }, "15"));
  });

  it("rejects timestamps that do not align to the interval", () => {
    assert.throws(() =>
      validateCandle({ ...valid, openTime: valid.openTime + 1 }, "15"),
    );
  });
});
