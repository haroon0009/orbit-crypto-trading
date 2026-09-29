import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Decimal } from "decimal.js";
import type { Pool } from "pg";

import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import { CapitalAllocationRepository } from "../src/persistence/capital.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";

describe("capital allocation", () => {
  let pool: Pool;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
  });

  after(async () => {
    await pool.end();
  });

  it("serializes concurrent reservations without exceeding allocation", async () => {
    const accountKey = `TEST-${randomUUID()}`;
    const repository = new CapitalAllocationRepository(pool);
    const allocationId = await repository.create(accountKey, "1000");
    const request = {
      timestamp: Date.UTC(2026, 0, 1),
      direction: "LONG" as const,
      entryPrice: "1",
      stopLoss: "0.5",
      takeProfit: "2",
      leverage: "1",
      feeRate: "0",
      currentNotional: "0",
      openPositions: 0,
      dailyRealizedPnl: "0",
      sizing: { type: "FIXED_AMOUNT" as const, amount: "600" },
      instrument: {
        tickSize: "0.1",
        quantityStep: "1",
        minQuantity: "1",
        minNotional: "1",
        maxLeverage: "2",
      },
      policy: {
        maxLeverage: "2",
        maxNotional: "2000",
        maxOpenPositions: 2,
        maxDailyLoss: "100",
      },
    };

    const decisions = await Promise.all([
      repository.reserve(accountKey, request),
      repository.reserve(accountKey, request),
    ]);
    const reserved = Decimal.sum(
      ...decisions.map((decision) => decision.capitalRequired ?? "0"),
    );
    const stored = await pool.query<{
      reserved_capital: string;
      decisions: string;
    }>(
      `SELECT reserved_capital::text,
         (SELECT count(*)::text FROM risk_decisions WHERE allocation_id = $1) AS decisions
       FROM capital_allocations WHERE id = $1`,
      [allocationId],
    );

    assert.equal(reserved.toString(), "1000");
    assert.equal(stored.rows[0]?.reserved_capital, "1000.000000000000000000");
    assert.equal(stored.rows[0]?.decisions, "2");

    for (const decision of decisions) {
      if (decision.capitalRequired) {
        await repository.release(accountKey, decision.capitalRequired);
      }
    }
    await pool.query("DELETE FROM capital_allocations WHERE id = $1", [
      allocationId,
    ]);
  });
});
