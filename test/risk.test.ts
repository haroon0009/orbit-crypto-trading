import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateRisk, type RiskRequest } from "../src/risk/risk.js";

const base: RiskRequest = {
  timestamp: Date.UTC(2026, 0, 1),
  direction: "LONG",
  entryPrice: "100",
  stopLoss: "98.03",
  takeProfit: "103.07",
  leverage: "2",
  feeRate: "0",
  allocatedCapital: "1000",
  availableCapital: "1000",
  currentNotional: "0",
  openPositions: 0,
  dailyRealizedPnl: "0",
  sizing: { type: "FIXED_AMOUNT", amount: "100" },
  instrument: {
    tickSize: "0.1",
    quantityStep: "0.01",
    minQuantity: "0.01",
    minNotional: "5",
    maxLeverage: "10",
  },
  policy: {
    maxLeverage: "5",
    maxNotional: "10000",
    maxOpenPositions: 1,
    maxDailyLoss: "100",
  },
};

describe("evaluateRisk", () => {
  it("supports all sizing modes and conservative price quantization", () => {
    const fixed = evaluateRisk(base);
    const percent = evaluateRisk({
      ...base,
      sizing: { type: "PERCENT_OF_ALLOCATION", percent: "10" },
    });
    const risk = evaluateRisk({
      ...base,
      sizing: { type: "RISK_PERCENTAGE", percent: "1" },
    });

    assert.equal(fixed.quantity, "2");
    assert.equal(percent.quantity, "2");
    assert.equal(risk.quantity, "5.26");
    assert.equal(fixed.stopLoss, "98.1");
    assert.equal(fixed.takeProfit, "103");
  });

  it("rejects policy violations with an auditable reason", () => {
    const cases: Array<[RiskRequest, string]> = [
      [{ ...base, leverage: "6" }, "MAX_LEVERAGE_EXCEEDED"],
      [{ ...base, openPositions: 1 }, "MAX_POSITION_LIMIT"],
      [{ ...base, dailyRealizedPnl: "-100" }, "MAX_DAILY_LOSS_REACHED"],
      [{ ...base, currentNotional: "9900" }, "MAX_NOTIONAL_EXCEEDED"],
      [
        {
          ...base,
          instrument: { ...base.instrument, quantityStep: "0" },
        },
        "INVALID_CONFIGURATION",
      ],
    ];

    for (const [request, reason] of cases) {
      const decision = evaluateRisk(request);
      assert.equal(decision.accepted, false);
      assert.equal(decision.reason, reason);
    }
  });
});
