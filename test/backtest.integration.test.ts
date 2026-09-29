import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import type { Pool } from "pg";

import { runBacktest } from "../src/backtest/engine.js";
import { migrate } from "../src/db/migrate.js";
import { createPool } from "../src/db/pool.js";
import type { Signal } from "../src/domain/trading.js";
import type { Candle } from "../src/market-data/candle.js";
import { BacktestRepository } from "../src/persistence/backtests.js";
import type { Strategy } from "../src/strategies/strategy.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://bot:bot@localhost:5433/crypto_bot";
const start = Date.UTC(2026, 0, 1);
const duration = 15 * 60_000;
const candles: Candle[] = [
  { open: "100", high: "101", low: "99", close: "100" },
  { open: "100", high: "105", low: "97", close: "100" },
  { open: "100", high: "101", low: "94", close: "96" },
].map((prices, index) => ({
  openTime: start + index * duration,
  ...prices,
  volume: "10",
  turnover: "1000",
}));
const risk = {
  allocation: "1000",
  leverage: "1",
  sizing: { type: "FIXED_AMOUNT" as const, amount: "100" },
  instrument: {
    tickSize: "1",
    quantityStep: "1",
    minQuantity: "1",
    minNotional: "1",
    maxLeverage: "10",
  },
  policy: {
    maxLeverage: "3",
    maxNotional: "10000",
    maxOpenPositions: 1,
    maxDailyLoss: "1000",
  },
};

class FixtureStrategy implements Strategy {
  readonly id = "FIXTURE";
  readonly version = "1";

  onCandle(candle: Readonly<Candle>): Signal | null {
    if (candle.openTime === start) {
      return {
        direction: "LONG",
        stopLoss: "98",
        takeProfit: "104",
        generatedAt: candle.openTime,
      };
    }
    if (candle.openTime === start + duration) {
      return {
        direction: "SHORT",
        stopLoss: "102",
        takeProfit: "96",
        generatedAt: candle.openTime,
      };
    }
    return null;
  }
}

describe("deterministic backtest", () => {
  let pool: Pool;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    await migrate();
    pool = createPool(databaseUrl);
  });

  after(async () => {
    await pool.end();
  });

  it("enters on the next candle, chooses stop first, and persists results", async () => {
    const result = runBacktest({
      candles,
      strategy: new FixtureStrategy(),
      symbol: "TESTUSDT",
      interval: "15",
      config: {
        startingBalance: "1000",
        feeRate: "0.001",
        slippageBps: "0",
        closeOpenPositionAtEnd: true,
        risk,
      },
    });

    assert.equal(result.trades.length, 2);
    assert.equal(result.trades[0]?.entry.timestamp, start + duration);
    assert.equal(result.trades[0]?.exitReason, "STOP_LOSS");
    assert.equal(result.trades[0]?.exit.price, "98");
    assert.equal(result.trades[1]?.direction, "SHORT");
    assert.equal(result.trades[1]?.exitReason, "TAKE_PROFIT");
    assert.equal(result.metrics.finalBalance, "1001.606");
    assert.equal(result.metrics.totalTrades, 2);
    assert.equal(result.metrics.winningTrades, 1);
    assert.equal(result.metrics.losingTrades, 1);
    assert.equal(result.metrics.maxDrawdown, "2.198");
    assert.equal(result.riskDecisions.length, 2);
    assert.ok(result.riskDecisions.every((decision) => decision.accepted));

    await new BacktestRepository(pool).save(result);
    const stored = await pool.query<{
      trades: string;
      equity: string;
      decisions: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM backtest_trades WHERE run_id = $1) AS trades,
         (SELECT count(*)::text FROM backtest_equity WHERE run_id = $1) AS equity,
         (SELECT count(*)::text FROM risk_decisions WHERE run_id = $1) AS decisions`,
      [result.runId],
    );
    assert.deepEqual(stored.rows[0], {
      trades: "2",
      equity: "3",
      decisions: "2",
    });
    await pool.query("DELETE FROM backtest_runs WHERE id = $1", [result.runId]);
  });

  it("rejects slippage that could produce a non-positive fill price", () => {
    assert.throws(
      () =>
        runBacktest({
          candles,
          strategy: new FixtureStrategy(),
          symbol: "TESTUSDT",
          interval: "15",
          config: {
            startingBalance: "1000",
            feeRate: "0.001",
            slippageBps: "10000",
            closeOpenPositionAtEnd: true,
            risk,
          },
        }),
      /Invalid slippage/,
    );
  });
});
